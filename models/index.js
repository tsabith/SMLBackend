const sequelize = require('../config/database');
const User = require('./User');
const Server = require('./Server');
const Project = require('./Project');

// Sync database
const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ Database synchronized successfully.');
    
    // Create default admin user if not exists
    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: 'admin123'
      });
      console.log('✅ Default admin user created (username: admin, password: admin123)');
    }
  } catch (error) {
    console.error('❌ Error synchronizing database:', error.message);
  }
};

module.exports = {
  sequelize,
  User,
  Server,
  Project,
  syncDatabase
};