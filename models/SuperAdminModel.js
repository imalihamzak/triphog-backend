const bcrypt = require('bcryptjs');
const crypto=require('crypto')
const mongoose = require('mongoose');

// The default plain text password
const defaultPassword = 'rememberIT@123';
 // Generate a token
 const token = crypto.randomBytes(20).toString("hex");
 const tokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now
 
 async function hashPassword() {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(defaultPassword, salt);
  return hashedPassword;
}

let hashedPassword=hashPassword()
console.log("Super Admin Hashed Password")
console.log(hashedPassword)
console.log("Default Password")

const superAdminSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required:true
  },
  docs:{
      type:Array,
      default:[]
  },
  lastName:{
    type:String,
    required:true
  },
  EMailAddress:{
    type:String,
    required:true
  },
  password: {
    type:String,
    required:true
  },
  passwordResetToken:{
    type:String,
    default:token
  },
  passwordResetExpires:{
    type:Date,
    default:tokenExpiry
  },
  role:{
      type:String,
      default:"Super Admin"
  },
  photo: {
    type: String,
    default: ""
  },
  phoneNumber: {
    type: String,
    default: ""
  }
});

const SuperAdminModel = mongoose.model('TriphogSuperAdmin', superAdminSchema);

// Export the model
module.exports = SuperAdminModel;
