const NotificationModel=require('../models/NotificationModel')
exports.getMyNotifications=async(req,res)=>{
    try{
        let myNotifications=await NotificationModel.find({toId:req.params.userId})
        res.json({success:true,myNotifications})
    }
    catch(e){
        res.json({success:false,message:e.message})
        
    }
}