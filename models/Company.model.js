import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        unique: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        unique: true
    },
    address: {
        street: String,
        city: String,
        country: String,
        zipCode: String
    },
    vatNumber: {
        type: String,
        required: true,
        unique: true
    },
    logo: String,
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    walletBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    walletHistory: [{
        amount: Number,
        balanceBefore: Number,
        balanceAfter: Number,
        date: {
            type: Date,
            default: Date.now
        },
        description: String,
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    status: {
        type: String,
        enum: ['active', 'suspended', 'pending', 'rejected'], // ✅ Added 'rejected'
        default: 'pending'
    },
    // ✅ NEW: Approval tracking
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rejectedAt: Date,
    rejectionReason: String
}, {
    timestamps: true
});

const Company = mongoose.model('Company', companySchema);

export default Company;