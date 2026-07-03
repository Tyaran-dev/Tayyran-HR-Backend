import mongoose from 'mongoose';


const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    type: {
        type: String,
        enum: [
            'booking_pending',      // New booking needs approval
            'booking_approved',     // Booking was approved
            'booking_rejected',     // Booking was rejected
            'booking_confirmed',    // Booking payment completed
            'booking_cancelled'     // Booking was cancelled
        ],
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date,
        default: null
    },
    message: {
        type: String,
        required: true
    },
    metadata: {
        bookingReference: String,
        bookingType: String,
        finalAmount: Number,
        requesterName: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;