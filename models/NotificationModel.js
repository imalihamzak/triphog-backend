const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  text: String,
  type: String,
  fromId:{
      type:String,
      required:true
  },


from:{
    type:String,
    required:true
},
  toId:{
      type:String,
      required:true
  },
  fromPhotoUrl:{
      type:String,
      required:true
  },
  createdAt:{
      type:Date,
      default:Date.now
  }
});

const NotificationModel = mongoose.model('Notification', notificationSchema);

module.exports = NotificationModel;