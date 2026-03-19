const multer = require("multer");
const path = require("path");
// const sharp = require("sharp");

const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, `/../public/images`));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb({ message: "Unsupported file type" }, false);
  }
};

const uploadPhoto = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fieldSize: 200000 },
});

const imgResize = async (req, resp, next) => {
  if (!req.file) {
    return next();
  } else {
    await sharp(req.file.path)
      .resize({ width: 250, height: 250 }) // Corrected the resize dimensions
      .toFormat("jpeg")
      .jpeg({ quality: 90 })
      .toFile(`public/images/${req.file.filename}`); // Corrected the path
  }
  next();
};

const uploadImages = async (req, resp) => {
  console.log(req.file); // Changed from req.files to req.file
  resp.status(200).json({
    data: req.file, // Changed from req.files to req.file
  });
};

module.exports = { uploadPhoto, imgResize, uploadImages };
