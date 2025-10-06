const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        error: true,
        message: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findByPk(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        error: true,
        message: 'Invalid token'
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      username: user.username
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      error: true,
      message: 'Invalid or expired token'
    });
  }
};

module.exports = authMiddleware;