const express = require('express');
const { Server } = require('../models');
const authMiddleware = require('../middleware/auth');
const { NodeSSH } = require('node-ssh');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get all servers
router.get('/', async (req, res) => {
  try {
    const servers = await Server.findAll({
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      data: servers
    });
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch servers'
    });
  }
});

// Get single server
router.get('/:id', async (req, res) => {
  try {
    const server = await Server.findByPk(req.params.id, {
      include: [{ association: 'projects' }]
    });
    
    if (!server) {
      return res.status(404).json({
        error: true,
        message: 'Server not found'
      });
    }
    
    res.json({
      success: true,
      data: server
    });
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch server'
    });
  }
});

// Create server
router.post('/', async (req, res) => {
  try {
    const {
      name,
      ip_address,
      ssh_port = 22,
      ssh_username,
      ssh_password,
      ssh_private_key,
      cpu_info,
      ram_info,
      storage_info
    } = req.body;

    // Validate required fields
    if (!name || !ip_address || !ssh_username) {
      return res.status(400).json({
        error: true,
        message: 'Name, IP address, and SSH username are required'
      });
    }

    if (!ssh_password && !ssh_private_key) {
      return res.status(400).json({
        error: true,
        message: 'Either SSH password or private key is required'
      });
    }

    const server = await Server.create({
      name,
      ip_address,
      ssh_port,
      ssh_username,
      ssh_password,
      ssh_private_key,
      cpu_info,
      ram_info,
      storage_info,
      status: 'offline'
    });

    res.status(201).json({
      success: true,
      message: 'Server created successfully',
      data: server
    });
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to create server'
    });
  }
});

// Update server
router.put('/:id', async (req, res) => {
  try {
    const server = await Server.findByPk(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        error: true,
        message: 'Server not found'
      });
    }

    const {
      name,
      ip_address,
      ssh_port,
      ssh_username,
      ssh_password,
      ssh_private_key,
      cpu_info,
      ram_info,
      storage_info
    } = req.body;

    await server.update({
      name: name || server.name,
      ip_address: ip_address || server.ip_address,
      ssh_port: ssh_port || server.ssh_port,
      ssh_username: ssh_username || server.ssh_username,
      ssh_password: ssh_password || server.ssh_password,
      ssh_private_key: ssh_private_key || server.ssh_private_key,
      cpu_info: cpu_info || server.cpu_info,
      ram_info: ram_info || server.ram_info,
      storage_info: storage_info || server.storage_info
    });

    res.json({
      success: true,
      message: 'Server updated successfully',
      data: server
    });
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to update server'
    });
  }
});

// Delete server
router.delete('/:id', async (req, res) => {
  try {
    const server = await Server.findByPk(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        error: true,
        message: 'Server not found'
      });
    }

    // Check if server has projects
    const projectCount = await server.countProjects();
    if (projectCount > 0) {
      return res.status(400).json({
        error: true,
        message: `Cannot delete server with ${projectCount} active project(s)`
      });
    }

    await server.destroy();

    res.json({
      success: true,
      message: 'Server deleted successfully'
    });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to delete server'
    });
  }
});

// Test SSH connection
router.post('/:id/test', async (req, res) => {
  const ssh = new NodeSSH();
  
  try {
    const server = await Server.findByPk(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        error: true,
        message: 'Server not found'
      });
    }

    // Build SSH config
    const sshConfig = {
      host: server.ip_address,
      port: server.ssh_port,
      username: server.ssh_username
    };

    if (server.ssh_password) {
      sshConfig.password = server.ssh_password;
    } else if (server.ssh_private_key) {
      sshConfig.privateKey = server.ssh_private_key;
    }

    // Try to connect
    await ssh.connect(sshConfig);

    // Get system info
    const result = await ssh.execCommand('uname -a && uptime');

    // Update server status
    await server.update({
      status: 'online',
      last_checked: new Date()
    });

    ssh.dispose();

    res.json({
      success: true,
      message: 'Connection successful',
      data: {
        status: 'online',
        systemInfo: result.stdout
      }
    });
  } catch (error) {
    console.error('SSH connection error:', error);
    
    // Update server status to error
    const server = await Server.findByPk(req.params.id);
    if (server) {
      await server.update({
        status: 'error',
        last_checked: new Date()
      });
    }

    if (ssh) {
      ssh.dispose();
    }

    res.status(500).json({
      error: true,
      message: 'Connection failed: ' + error.message
    });
  }
});

module.exports = router;