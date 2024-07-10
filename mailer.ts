import nodemailer from 'nodemailer';
import { logging } from './logging';

logging.info(`== SMTP-Settings [START] ==`)
logging.info(`Host: ${process.env.MAIL_HOSTNAME}`)
logging.info(`Port: ${process.env.MAIL_PORT}`)
logging.info(`Username: ${process.env.MAIL_USERNAME}`)
logging.info(`Password: ${process.env.MAIL_PASSWORD}`)
logging.info(`== SMTP-Settings [END] ==`)

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOSTNAME,
    port: process.env.MAIL_PORT,
    secure: false,
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
    },
});

export default transporter;
export { transporter as mailer };