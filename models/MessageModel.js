const { Schema, default: mongoose } = require("mongoose");

const messageSchema=new Schema({
    senderId:{
        type:String,
        required:true
    },
    receiverId:{
        type:String,
        required:true
    },
    text:{
        type:String,
        default:""
    },
    mediaType:{
        type:String,
        default:""
    },
    mediaUrl:{
        type:String,
        default:""
    },
    addedON:{
        type:String,
        default:""
    },
    isRead:{
      type:Boolean,
      default:false
    },
    addedAt:{
        type:String,
        default:""
    }
})
let MessageModel=mongoose.model("Message",messageSchema)
module.exports=MessageModel