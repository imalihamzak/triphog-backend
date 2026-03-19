const { default: mongoose } = require("mongoose");
let driverSchema= new mongoose.Schema({
    firstName:{
        type:String,
        required:true
    },
    lastName:{
        type:String,
        required:true
    },
    passwordResetToken:{
        type:String,
        default:""
    },
    passwordResetExpires:{
        type:Date
    },
    paymentType:{
        type:String,
        default:"hourly"
    },
    payPerMile:{
        type:Number,
        default:0
    },
    docs:{
        type:Array,
        default:[]
    },
    isApproved:{
        type:Boolean,
        default:true
    },
    
    EMailAddress:{
        type:String,
        required:true,
        unique: [true, "This Email Already Used"]
    },
    
    addedBy:{
        type:String,
        required:true
    },
    password:{
        type:String,
        default:""
    },
    isAvailable:{
        type:Boolean,
        default:true
    },


    phoneNumber:{
        type:String,
        required:true
    },
    token:{type:String},
    status:{
      type:String,
      default:"unactive"
    },
    location:{
        type:String,
        required:true
    },
    vehicleName:{
        type:String,
        required:true
    },
    gender:{
        type:String,
        required:true
    },
    signatureUrl:{
        type:String,
        default:""
    },
    profilePhotoUrl:{
        type:String,
        default:""
    },
    longitude:{
        type:Number,
        default:0
    },
    latitude:{
      type:Number,
      default:0
    },
    licenseUrl:{
        type:String,
        default:""
    },
    IDCardUrl:{
        type:String,
        default:""
    },
    totalTrips:{
        type:Number,
        default:0
    },
    performance:{
        type:Number,
        default:0
    },
    completionTime:{
        type:Number,
        default:0
    },
    hourlyPay:{
        type:Number,
        required:true
    },
    paymentHistory:{
        type:Array,
        default:[]
    },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    totalMiles: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
})
const DriverModel=mongoose.model("Drivers",driverSchema)
module.exports=DriverModel