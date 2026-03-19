// const express=require('express')
// //const app=require('./index')
// const socketIo=require('socket.io')
// const http=require('http')
// const morgan = require("morgan");
// const cors = require("cors");
// const bodyParser = require("body-parser");
// const cookieParser = require("cookie-parser");
// const path=require('path')
// // const googleAuthRoutes = require(`${__dirname}/routes/googleAuthRoutes`);
// // const superadminRouter = require(`${__dirname}/routes/superAdminRouter`);
// // const adminRouter = require(`${__dirname}/routes/adminRouter`);
// // const calendarRouter = require(`${__dirname}/routes/meetingRouter`);
// // const {driverRouter} = require(`./routes/driverRouter`)
// // const patientRouter=require(`${__dirname}/routes/patientRouter`)
// // const tripRouter=require(`${__dirname}/routes/tripRouter`)
// // const userRouter=require(`${__dirname}/routes/userRouter`)
// // app.use(morgan("dev"));
// // app.use(express.json());
// // app.use(bodyParser.urlencoded({ extended: true }));
// // // app.use(upload.array());
// // app.use(express.static("public"));
// // app.use(cookieParser());
// // app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // //Multer Configuration to Upload Images

// // app.use(
// //   cors({
// //     origin: true,
// //     credentials: true,
// //   })
// // );

// // app.use("/auth", googleAuthRoutes);
// // app.use("/api/v1/superadmin", superadminRouter);
// // app.use("/api/v1/admin", adminRouter);
// // app.use("/api/v1/calendar", calendarRouter);
// // app.use("/driver",driverRouter)
// // app.use("/api/v1/patient",patientRouter)
// // app.use("/api/v1/trip",tripRouter)
// // app.use("/api/v1/user",userRouter)

// // app.use("*", (req, resp) => {
// //   resp.status(404).json({
// //     status: "fail",
// //     message: "Page Not Found",
// //   });
// // });
// let server =http.createServer(app)
// let IO = socketIo(server,{cors:{origin:"*"}});
// let connectedUsers=[]
//  IO.on("connection",(socket)=>{
//   let userId= socket.handshake.query.userId
//   let alreadyConnected=false
//   console.log(userId)
//   console.log(connectedUsers)
//   for(let user of connectedUsers)
//   {
//     if(user.ID==userId)
//     {
//         alreadyConnected=true
//         console.log("This user is already connected")
//     }
//   }
//   if(alreadyConnected)
//   {
//   let _connectedUsers=connectedUsers.filter((user)=>{return user.ID!=userId})
//   console.log(_connectedUsers)
//   _connectedUsers.push({ID:userId,socketId:socket.id})
//   connectedUsers=_connectedUsers
//   }
//   else
//   {
//     connectedUsers.push({ID:userId,socketId:socket.id})
//   }
//     console.log("A New User Connected With Id:",socket.id)
//     console.log(connectedUsers)

//     socket.on('disconnect',()=>{
//         connectedUsers=connectedUsers.filter((user)=>{return(user.socketId!=socket.id)})
//         console.log(connectedUsers)
//         console.log("User with Id",socket.id,"has been disconnected")
//     })
//  })
//  let getReceiverSocketId=(userId)=>
//  {
//     let socketId=""
//     for(let user of connectedUsers)
//     {
//         if(user.ID==userId)
//         {
//             socketId=user.socketId

//         }
//     }
//  return socketId
//  }

// module.exports={IO,getReceiverSocketId} 