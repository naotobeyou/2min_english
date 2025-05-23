const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ended: { type: Boolean, default: false }
}, { timestamps: true }); 

module.exports = mongoose.model('Room', roomSchema);
