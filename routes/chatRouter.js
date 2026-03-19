const express=require('express')
const JWT_SECRET = require("../config/jwtSecret");
const jwt=require('jsonwebtoken')
const{createGroup,sendMessage,getMessages,getMyMessages, getMyChats,sendGroupMessage,deleteChat, getGroupMessages}=require("..//controllers/ChatController")
const multer=require('multer')
let storage= multer.diskStorage({destination:(req,file,cb)=>{
    console.log(file)
     cb(null,'uploads')
},filename:(req,file,cb)=>{
    console.log(file)
    cb(null,file.originalname)
 }})
 let router= express.Router()

 let upload= multer({storage:storage})
router.delete("/deletechat/:senderId/:receiverId",deleteChat)
 router.get("/getmessages/:senderId/:receiverId",getMessages)
 router.get("/getgroupmessages/:groupId",getGroupMessages)
router.post("/sendmessage/:senderId/:receiverId",upload.single("file"),sendMessage)
router.post("/sendgroupmessage/:groupId",upload.single("file"),sendGroupMessage)
router.post("/creategroup",createGroup)
router.get("/getmymessages", (req,res,next)=>{
    try{
        const token=req.headers['authorization']
        if(!token)
        {
            res.json({success:false,message:"No Token Provided!"})
        }
        else{
            jwt.verify(token,JWT_SECRET,(error,user)=>{
                if(error)
                {
                    res.json({success:false,message:"Invalid Token"})

                }
            else if(user.role=="SuperAdmin")
            {
                  console.log("User",user)
                    req.userId=user.id
                    req.userRole=user.role
                    next()
                
            }
                else if(user.role=="Admin"){
                    console.log("User",user)
                    req.userId=user.id
                    req.userRole=user.role
                    next()
                }
                else if(user.role=="User")
                {
                    console.log("User",user)
                    req.userId=user.createdBy
                    req.userRole=user.role
                    next()
                    
                }
                else{
                    req.userId=user.id
                    req.userRole=user.role
                    next()
                }
            })


        }

    }
    catch(e)
    {

    }
}, getMyMessages)
router.get("/getmychats",(req,res,next)=>{
    try{
        const token=req.headers['authorization']
        if(!token)
        {
            res.json({success:false,message:"No Token Provided!"})
        }
        else{
            jwt.verify(token,JWT_SECRET,(error,user)=>{
                if(error)
                {
                    res.json({success:false,message:"Invalid Token"})

                }
            else if(user.role=="SuperAdmin")
            {
                  console.log("User",user)
                    req.userId=user.id
                    req.userRole=user.role
                    next()
                
            }
                else if(user.role=="Admin"){
                    console.log("User",user)
                    req.userId=user.id
                    req.userRole=user.role
                    next()
                }
                else if(user.role=="User")
                {
                    console.log("User",user)
                    req.userId=user.createdBy
                    req.userRole=user.role
                    next()
                    
                }
                else{
                    req.userId=user.id
                    req.userRole=user.role
                    next()
                }
            })


        }

    }
    catch(e)
    {

    }
},getMyChats)
module.exports=router