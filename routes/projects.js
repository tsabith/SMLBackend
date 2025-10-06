const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { Project, Server } = require('../models');
const authMiddleware = require('../middleware/auth');
const deploymentService = require('../services/deploymentService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// All routes require authentication
router.use(authMiddleware);

// Get all projects
router.get('/', async (req, res) => {
  try {
    const { search, server_id } = req.query;
    
    const where = {};
    if (search) {
      where.name = { [require('sequelize').Op.like]: `%${search}%` };
    }
    if (server_id) {
      where.server_id = server_id;
    }

    const projects = await Project.findAll({
      where,
      include: [{ 
        model: Server, 
        as: 'server',
        attributes: ['id', 'name', 'ip_address', 'status']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch projects'
    });
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id, {
      include: [{ 
        model: Server, 
        as: 'server' 
      }]
    });

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found'
      });
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch project'
    });
  }
});

// Create project with GitHub URL
router.post('/', async (req, res) => {
  try {
    const {
      name,
      project_type,
      source_type,
      source_url,
      server_id,
      deploy_path,
      domain,
      custom_commands
    } = req.body;

    // Validate required fields
    if (!name || !project_type || !source_type || !server_id) {
      return res.status(400).json({
        error: true,
        message: 'Name, project type, source type, and server are required'
      });
    }

    if (source_type === 'github' && !source_url) {
      return res.status(400).json({
        error: true,
        message: 'GitHub URL is required for GitHub projects'
      });
    }

    // Check if server exists
    const server = await Server.findByPk(server_id);
    if (!server) {
      return res.status(404).json({
        error: true,
        message: 'Server not found'
      });
    }

    const project = await Project.create({
      name,
      project_type,
      source_type,
      source_url,
      deploy_path: deploy_path || '/var/www/html',
      domain,
      custom_commands,
      server_id,
      status: 'inactive'
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to create project'
    });
  }
});

// Create project with file upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const {
      name,
      project_type,
      server_id,
      deploy_path,
      domain,
      custom_commands
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        error: true,
        message: 'No file uploaded'
      });
    }

    // Check if server exists
    const server = await Server.findByPk(server_id);
    if (!server) {
      return res.status(404).json({
        error: true,
        message: 'Server not found'
      });
    }

    const project = await Project.create({
      name,
      project_type,
      source_type: 'upload',
      source_path: req.file.path,
      deploy_path: deploy_path || '/var/www/html',
      domain,
      custom_commands,
      server_id,
      status: 'inactive'
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to create project'
    });
  }
});

// Update project
router.put('/:id', async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found'
      });
    }

    const {
      name,
      project_type,
      source_url,
      deploy_path,
      domain,
      custom_commands
    } = req.body;

    await project.update({
      name: name || project.name,
      project_type: project_type || project.project_type,
      source_url: source_url || project.source_url,
      deploy_path: deploy_path || project.deploy_path,
      domain: domain !== undefined ? domain : project.domain,
      custom_commands: custom_commands !== undefined ? custom_commands : project.custom_commands
    });

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: project
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to update project'
    });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found'
      });
    }

    // Delete uploaded file if exists
    if (project.source_path) {
      try {
        await fs.unlink(project.source_path);
      } catch (err) {
        console.error('Failed to delete uploaded file:', err);
      }
    }

    await project.destroy();

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to delete project'
    });
  }
});

// Deploy project
router.post('/:id/deploy', async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id, {
      include: [{ model: Server, as: 'server' }]
    });

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found'
      });
    }

    // Check if server is online
    if (project.server.status === 'offline') {
      return res.status(400).json({
        error: true,
        message: 'Server is offline. Please check server status first.'
      });
    }

    // Update status to deploying
    await project.update({ status: 'deploying' });

    // Start deployment in background
    deploymentService.deploy(project)
      .then(async () => {
        await project.update({ 
          status: 'active',
          last_deployment: new Date()
        });
      })
      .catch(async (error) => {
        console.error('Deployment failed:', error);
        await project.update({ status: 'error' });
      });

    res.json({
      success: true,
      message: 'Deployment started',
      data: { status: 'deploying' }
    });
  } catch (error) {
    console.error('Deploy project error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to start deployment'
    });
  }
});

module.exports = router;