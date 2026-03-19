const { default: mongoose, Schema } = require("mongoose")

const groupSchema=new Schema({createdBy:{
    type:String,
    required:true
},
name:{
    type:String,
    required:true
},
messages:{
    type:Array,
    default:[]
},
members:{
    type:Array,
    default:[]
}
})
const GroupModel=mongoose.model("Group",groupSchema)
module.exports=GroupModel