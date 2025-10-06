const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Server = require('./Server');

const Project = sequelize.define('Project', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [3, 100]
    }
  },
  project_type: {
    type: DataTypes.ENUM('static', 'php', 'nodejs', 'python', 'custom'),
    allowNull: false,
    defaultValue: 'static'
  },
  source_type: {
    type: DataTypes.ENUM('github', 'upload'),
    allowNull: false
  },
  source_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  source_path: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deploy_path: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '/var/www/html'
  },
  domain: {
    type: DataTypes.STRING,
    allowNull: true
  },
  custom_commands: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'deploying', 'error'),
    defaultValue: 'inactive'
  },
  last_deployment: {
    type: DataTypes.DATE,
    allowNull: true
  },
  response_time: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Response time in milliseconds'
  },
  server_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'servers',
      key: 'id'
    }
  }
}, {
  tableName: 'projects',
  timestamps: true
});

// Define relationship
Project.belongsTo(Server, { foreignKey: 'server_id', as: 'server' });
Server.hasMany(Project, { foreignKey: 'server_id', as: 'projects' });

module.exports = Project;