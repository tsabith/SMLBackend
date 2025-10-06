const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');

class DeploymentService {
  async deploy(project) {
    const ssh = new NodeSSH();
    
    try {
      console.log(`Starting deployment for project: ${project.name}`);
      
      // Connect to server
      await this.connectSSH(ssh, project.server);
      
      // Create backup if project exists
      await this.createBackup(ssh, project);
      
      // Deploy based on source type
      if (project.source_type === 'github') {
        await this.deployFromGitHub(ssh, project);
      } else if (project.source_type === 'upload') {
        await this.deployFromUpload(ssh, project);
      }
      
      // Execute project type specific commands
      await this.executeProjectTypeCommands(ssh, project);
      
      // Execute custom commands if any
      if (project.custom_commands) {
        await this.executeCustomCommands(ssh, project);
      }
      
      console.log(`Deployment completed for project: ${project.name}`);
      
      ssh.dispose();
      return true;
    } catch (error) {
      console.error(`Deployment failed for project ${project.name}:`, error);
      if (ssh) {
        ssh.dispose();
      }
      throw error;
    }
  }

  async connectSSH(ssh, server) {
    const config = {
      host: server.ip_address,
      port: server.ssh_port,
      username: server.ssh_username
    };

    if (server.ssh_password) {
      config.password = server.ssh_password;
    } else if (server.ssh_private_key) {
      config.privateKey = server.ssh_private_key;
    }

    await ssh.connect(config);
    console.log('SSH connection established');
  }

  async createBackup(ssh, project) {
    try {
      const projectPath = path.join(project.deploy_path, project.name);
      const backupDir = '/var/backups/webdeploy';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${project.name}_${timestamp}`;

      // Check if project directory exists
      const checkResult = await ssh.execCommand(`test -d ${projectPath} && echo "exists" || echo "not found"`);
      
      if (checkResult.stdout.trim() === 'exists') {
        console.log('Creating backup of existing project...');
        
        // Create backup directory
        await ssh.execCommand(`mkdir -p ${backupDir}`);
        
        // Create backup (tar.gz)
        await ssh.execCommand(`tar -czf ${backupDir}/${backupName}.tar.gz -C ${project.deploy_path} ${project.name}`);
        
        console.log(`Backup created: ${backupName}.tar.gz`);
        
        // Clean old backups (keep last 5)
        await ssh.execCommand(`cd ${backupDir} && ls -t ${project.name}_*.tar.gz | tail -n +6 | xargs -r rm`);
      }
    } catch (error) {
      console.error('Backup creation failed:', error);
      // Don't throw - backup failure shouldn't stop deployment
    }
  }

  async deployFromGitHub(ssh, project) {
    console.log(`Deploying from GitHub: ${project.source_url}`);
    
    const projectPath = path.join(project.deploy_path, project.name);
    
    // Check if directory exists
    const checkResult = await ssh.execCommand(`test -d ${projectPath} && echo "exists" || echo "not found"`);
    
    if (checkResult.stdout.trim() === 'exists') {
      // Directory exists - pull latest changes
      console.log('Pulling latest changes...');
      const result = await ssh.execCommand(`cd ${projectPath} && git pull origin main || git pull origin master`);
      
      if (result.code !== 0) {
        throw new Error(`Git pull failed: ${result.stderr}`);
      }
      
      console.log('Git pull output:', result.stdout);
    } else {
      // Directory doesn't exist - clone repository
      console.log('Cloning repository...');
      await ssh.execCommand(`mkdir -p ${project.deploy_path}`);
      
      const result = await ssh.execCommand(`cd ${project.deploy_path} && git clone ${project.source_url} ${project.name}`);
      
      if (result.code !== 0) {
        throw new Error(`Git clone failed: ${result.stderr}`);
      }
      
      console.log('Git clone output:', result.stdout);
    }
  }

  async deployFromUpload(ssh, project) {
    console.log('Deploying from uploaded file...');
    
    const projectPath = path.join(project.deploy_path, project.name);
    
    // Create project directory
    await ssh.execCommand(`mkdir -p ${projectPath}`);
    
    // Upload file to server
    await ssh.putFile(project.source_path, `/tmp/${path.basename(project.source_path)}`);
    
    // Extract file based on extension
    const ext = path.extname(project.source_path).toLowerCase();
    
    if (ext === '.zip') {
      await ssh.execCommand(`unzip -o /tmp/${path.basename(project.source_path)} -d ${projectPath}`);
    } else if (ext === '.tar' || ext === '.gz' || ext === '.tgz') {
      await ssh.execCommand(`tar -xzf /tmp/${path.basename(project.source_path)} -C ${projectPath}`);
    } else {
      // Single file - just copy it
      await ssh.execCommand(`cp /tmp/${path.basename(project.source_path)} ${projectPath}/`);
    }
    
    // Clean up temp file
    await ssh.execCommand(`rm /tmp/${path.basename(project.source_path)}`);
    
    console.log('File uploaded and extracted');
  }

  async executeProjectTypeCommands(ssh, project) {
    const projectPath = path.join(project.deploy_path, project.name);
    
    console.log(`Executing ${project.project_type} specific commands...`);
    
    switch (project.project_type) {
      case 'nodejs':
        // Install dependencies
        await ssh.execCommand(`cd ${projectPath} && npm install`);
        
        // Restart with PM2 if installed
        const pm2Check = await ssh.execCommand('which pm2');
        if (pm2Check.code === 0) {
          await ssh.execCommand(`pm2 restart ${project.name} || pm2 start npm --name "${project.name}" -- start`, {
            cwd: projectPath
          });
          console.log('Node.js app restarted with PM2');
        }
        break;
        
      case 'php':
        // Install composer dependencies if composer.json exists
        const composerCheck = await ssh.execCommand(`test -f ${projectPath}/composer.json && echo "exists"`);
        if (composerCheck.stdout.trim() === 'exists') {
          await ssh.execCommand(`cd ${projectPath} && composer install --no-dev --optimize-autoloader`);
          console.log('Composer dependencies installed');
        }
        break;
        
      case 'python':
        // Install pip requirements if requirements.txt exists
        const reqCheck = await ssh.execCommand(`test -f ${projectPath}/requirements.txt && echo "exists"`);
        if (reqCheck.stdout.trim() === 'exists') {
          await ssh.execCommand(`cd ${projectPath} && pip3 install -r requirements.txt`);
          console.log('Python dependencies installed');
        }
        break;
        
      case 'static':
        // No special commands for static sites
        console.log('Static site deployed - no additional commands needed');
        break;
        
      default:
        console.log('Unknown project type - skipping type-specific commands');
    }
    
    // Set proper permissions
    await ssh.execCommand(`chmod -R 755 ${projectPath}`);
  }

  async executeCustomCommands(ssh, project) {
    console.log('Executing custom commands...');
    
    const projectPath = path.join(project.deploy_path, project.name);
    const commands = project.custom_commands.split('\n').filter(cmd => cmd.trim());
    
    for (const command of commands) {
      console.log(`Executing: ${command}`);
      const result = await ssh.execCommand(command, { cwd: projectPath });
      
      if (result.code !== 0) {
        console.error(`Command failed: ${result.stderr}`);
      } else {
        console.log(`Command output: ${result.stdout}`);
      }
    }
  }
}

module.exports = new DeploymentService();