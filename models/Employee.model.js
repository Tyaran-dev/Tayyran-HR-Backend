import mongoose from 'mongoose';


const employeeSchema = new mongoose.Schema({
    // OWNERSHIP — always filter by this
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    addedBy: {           // which HR user added this employee
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    first_name: {
        type: String,
        required: true,
        trim: true,
    },
    last_name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    profileImg: String,
    jobTitle: String,
    department: String,
    personalInfo: {
        title: { type: String, enum: ['Mr', 'Ms', 'Mrs'], default: null },
        middle_name: { type: String, default: "" },
        dateOfBirth: {
            day: Number,
            month: Number,
            year: Number
        },
        nationality: { type: String, default: null },
        passport: {
            number: { type: String, default: null },
            issuingCountry: { type: String, default: null },
            expiryDate: {
                day: Number,
                month: Number,
                year: Number
            }
        },
        contact: {
            phoneCode: { type: String, default: null },
            phoneNumber: { type: String, default: null },
            email: { type: String, default: null }
        }
    },
}, { timestamps: true });

const Employee = mongoose.model('Employee', employeeSchema);

export default Employee;

