import nodemailer from 'nodemailer';


const sendEmail = async (options) => {
    // 1) Create transporter
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT) || 465,
        secure: Number(process.env.EMAIL_PORT) === 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
        tls: {
            rejectUnauthorized: false,
        },
        logger: process.env.EMAIL_LOGGER === 'true',
        debug: process.env.EMAIL_DEBUG === 'true',
    })

    // 2) Define email options using template literals if needed
    const mailOpts = {
        from: `Tayyran HR App <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        html: options.message,
        text: options.text || options.message.replace(/<[^>]*>/g, ""),
    };

    // 3) Send email
    try {

        await transporter.verify();
        console.log("SMTP connection verified");

        const result = await transporter.sendMail(mailOpts);
        console.log(`Email sent to ${options.email}`, result);
        return result;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error; // Re-throw to handle in calling function
    }
};

export default sendEmail;
