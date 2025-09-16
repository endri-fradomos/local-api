import nodemailer from "nodemailer";
import path from "path";

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.eu",
  port: 465,
  secure: true,
  auth: {
    user: "info@fradomos.al",
    pass: "Fradomos4202!",
  },
  logger: true,
  debug: true,
});

export async function sendWelcomeEmail(toEmail, firstName) {
  try {
    const info = await transporter.sendMail({
      from: `"Fradomos" <info@fradomos.al>`,
      to: toEmail,
      subject: "Welcome to Fradomos!",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; text-align: center; padding: 20px;">
          <img src="cid:logo" alt="Fradomos Logo" style="width: 150px; margin-bottom: 12px;" />
          <h2>Hello ${firstName || "there"}, welcome to Fradomos Smart Home</h2>
          <p>Thank you for joining us. Feel at home, from anywhere!</p>
          <a href="https://fradomos.al" 
             style="display: inline-block; padding: 12px 24px; margin-top: 20px;
                    background-color: #007BFF; color: white; text-decoration: none;
                    border-radius: 6px; font-weight: bold;">
            Visit Fradomos
          </a>
          <p style="margin-top: 40px; font-size: 12px; color: #888;">
            &copy; ${new Date().getFullYear()} Fradomos Smart Home
          </p>
        </div>
      `,
      attachments: [
        {
          filename: "logo.png",
          path: path.join(process.cwd(), "utils", "logo.png"), // <-- place logo.png here
          cid: "logo" // <-- must match the src="cid:logo" in HTML
        }
      ]
    });

    console.log("✅ Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ Email error:", err.message);
  }
}
