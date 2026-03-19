
const express=require('express')
const{getMyNotifications}=require("..//controllers/notificationController")
let router=express.Router()
router.get("/getmynotifications/:userId",getMyNotifications)
module.exports=router