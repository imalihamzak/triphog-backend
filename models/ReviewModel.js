const { default: mongoose } = require("mongoose");
let reviewSchema=mongoose.Schema({
    description:{
        type:String,
        required:true
        
    },
    rating:{
        type:Number,
        required:true
    },
    adminId:{
      type:String,
      required:true
    },
    from:{
        type:String,
        required:true
    },
    addedON:{
        type:String,
        required:true
    },
    createdAt: { type: Date, default: Date.now }
})
let ReviewModel=mongoose.model("Reviews",reviewSchema)
module.exports=ReviewModel