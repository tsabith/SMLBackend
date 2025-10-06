const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Server = sequelize.define('Server', {
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
  ip_address: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIP: true
    }
  },
  ssh_port: {
    type: DataTypes.INTEGER,
    defaultValue: 22
  },
  ssh_username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ssh_password: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ssh_private_key: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  cpu_info: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ram_info: {
    type: DataTypes.STRING,
    allowNull: true
  },
  storage_info: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'error'),
    defaultValue: 'offline'
  },
  last_checked: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'servers',
  timestamps: true
});

module.exports = Server;