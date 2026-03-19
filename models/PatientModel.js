const { default: mongoose } = require("mongoose");
let patientSchema= new mongoose.Schema({
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
    EMailAddress:{
        type:String,
        required:true,
        unique: [true, "This Email Already Used"]
    },
    addedBy:{
        type:String,
        default:""
    },

    phoneNumber:{
        type:String,
        default:""
    },
    location:{
        type:String,
        default:""
    },
    token:{
        type:String,
        default:"_345_345dfds4___.3.4545_3.._34_fs-&3"
    },
    password:{
        type:String,
    
    },
   
    status:{
        type:String,
        default:"unactive"
    },

    gender:{
        type:String,
        default:"None"
    },
    age:{
        type:Number,
        default:0
    },
    signatureUrl:{
        type:String,
        default:""
    },
    profilePhotoUrl:{
        type:String,
        default:""
    },
    emergencyContactName:{
        type:String,
        default:""
    },
    emergencyContactNumber:{
        type:String,
        default:""
    },
    notes: {
        type: String,
        default: ""
    },
    companyCode:{
        type:String,
       default:""
    },
    status: {
        type: String,
        default: "unactive"
    },
    createdAt: { type: Date, default: Date.now }
})
const PatientModel=mongoose.model("Patients",patientSchema)
module.exports=PatientModel