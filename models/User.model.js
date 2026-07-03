import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: {
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
    phone: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['super_admin', 'company_admin', 'company_user'],
        required: true,
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    userStatus: {
        type: String,
', 'sus        enum: ['pending', 'activepended'],
        default: 'pending',
    },
    isApproved: {
        type: Boolean,
        default: false
    },
    rejectionReason: String,
}, {
    timestamps: true
})

const User = mongoose.model('User', userSchema);

export default User;
