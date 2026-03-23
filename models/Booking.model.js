import mongoose from 'mongoose';


const bookingSchema = new mongoose.Schema({
    // USER & AGENCY IDENTIFICATION
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },

    // ========================================
    // BOOKING DETAILS
    // ========================================
    bookingType: {
        type: String,
        enum: ['flight', 'hotel'],
        required: true,
        index: true
    },
    bookingReference: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    // ========================================
    // APPROVAL WORKFLOW 
    // ========================================
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'not_required'],
        index: true,
        required: true,  // no default — set it explicitly
    },
    approvedAt: Date,
    rejectionReason: String,
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null  // set when admin approves/rejects
    },

    // ── BOOKING LIFECYCLE STATUS ─────────────────────────
    // Tracks WHERE the booking is in the process
    status: {
        type: String,
        enum: [
            'pending_approval',  // waiting for admin (company_user)
            'pending_payment',   // approved by admin but still waiting wallet , awaiting payment
            'confirmed',         // paid & confirmed
            'cancelled',
            'failed',
            'refunded'
        ],
        required: true,  // no default — set it explicitly
        index: true
    },
    // ========================================
    // PAYMENT DETAILS - Wallet Only
    // ========================================
    paymentMethod: {
        type: String,
        default: 'wallet' // Always wallet for B2B
    },

    finalAmount: {
        type: Number,
        required: true,
        min: 0
    },

    currency: {
        type: String,
        default: 'SAR'
    },


}, { timestamps: true });

export default mongoose.model('Booking', bookingSchema);
