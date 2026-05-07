# Email Notification System - Testing Guide

## Setup Requirements

### 1. Email Credentials (Gmail)
To use email notifications with Gmail:

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an **App Password** (16 characters):
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer" 
   - Copy the generated password
3. Update `.env` file:
   ```
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-16-char-app-password
   ```

**Note:** If you don't configure email credentials, the system will log a warning but continue functioning normally. Emails will not be sent.

---

## Testing Scenarios

### Scenario 1: Food Listing Confirmation Email
**Trigger:** Restaurant creates a new food listing

**Steps:**
1. Log in as **Restaurant**
2. Navigate to "Post Food" section
3. Fill in form:
   - Food Name: "Leftover Pizza"
   - Quantity: "5 kg"
   - Pickup Deadline: Tomorrow at 2 PM
4. Click "Post Food"
5. **Check email:** Restaurant should receive confirmation email

**Expected Email:**
- Subject: ✅ Food Listed!
- Contains: Food name, quantity, pickup deadline
- Professional HTML template with green styling

---

### Scenario 2: New Request Notification
**Trigger:** NGO requests food from a restaurant listing

**Steps:**
1. Log in as **NGO**
2. Browse available food listings
3. Click "Request" on any food item
4. **Check restaurant's email:** Should receive notification

**Expected Email:**
- Subject: 🤝 New Food Request from an NGO
- Contains: NGO name, food type, quantity
- Call-to-action link to manage requests
- Includes urgency: "respond within 30 minutes"

---

### Scenario 3: Request Approval Email
**Trigger:** Restaurant approves an NGO's food request

**Steps:**
1. Log in as **Restaurant**
2. Navigate to "Manage Requests"
3. Find a pending request
4. Click "Approve"
5. **Check NGO's email:** Should receive approval notification

**Expected Email:**
- Subject: ✅ Your Food Request Approved!
- Contains: Food name, restaurant name
- Celebratory message (uses "approved" language)
- Green styling to indicate positive action
- Instructions for next steps (pickup/delivery)

---

### Scenario 4: Request Rejection Email
**Trigger:** Restaurant rejects an NGO's food request

**Steps:**
1. Log in as **Restaurant**
2. Navigate to "Manage Requests"
3. Find a pending request
4. Click "Reject"
5. **Check NGO's email:** Should receive rejection notification

**Expected Email:**
- Subject: ❌ Your Food Request Status Update
- Contains: Food name, restaurant name
- Empathetic message about request not being approved
- "Browse More Food" button to discover alternatives
- Red styling to indicate rejection

---

### Scenario 5: Delivery Status Update - In Transit
**Trigger:** Restaurant marks delivery as "in transit"

**Steps:**
1. Log in as **Restaurant**
2. Navigate to active deliveries
3. Click "Mark as In Transit"
4. **Check NGO's email:** Should receive delivery update

**Expected Email:**
- Subject: 🚚 Your Food is On The Way!
- Contains: Food name, restaurant name, delivery status
- Shows delivery agent details (if available)
- Blue styling with delivery icon

---

### Scenario 6: Delivery Status Update - Delivered
**Trigger:** Restaurant marks delivery as "delivered"

**Steps:**
1. Log in as **Restaurant**
2. Find an "in transit" delivery
3. Click "Mark as Delivered"
4. **Check NGO's email:** Should receive delivery confirmation

**Expected Email:**
- Subject: ✅ Food Delivered Successfully!
- Contains: Confirmation of successful delivery
- Food and restaurant details
- Thank you message

---

## Email Service Architecture

### Email Functions Created

1. **sendRequestApprovedEmail()**
   - Recipients: NGO
   - Trigger: Request approved
   - Variables: NGO name, food type, restaurant name

2. **sendRequestRejectedEmail()**
   - Recipients: NGO
   - Trigger: Request rejected
   - Variables: NGO name, food type, restaurant name

3. **sendDeliveryUpdateEmail()**
   - Recipients: NGO
   - Trigger: Delivery status changes to "in transit" or "delivered"
   - Variables: Food type, restaurant, delivery agent (optional), status

4. **sendNewRequestNotificationEmail()**
   - Recipients: Restaurant
   - Trigger: NGO creates request for their food
   - Variables: Restaurant name, NGO name, food type, quantity

5. **sendFoodListingConfirmationEmail()**
   - Recipients: Restaurant
   - Trigger: Restaurant creates new food listing
   - Variables: Restaurant name, food name, quantity, pickup deadline

---

## Troubleshooting

### Issue: "Email service not configured properly"
**Solution:** 
- Add EMAIL_USER and EMAIL_PASSWORD to .env file
- Restart the server: `npm start`
- Check that Gmail app password is correct (16 chars, no spaces)

### Issue: "Failed to send email"
**Possible Causes:**
- Gmail app password is incorrect
- 2FA not enabled on Gmail
- Gmail account has security restrictions
- Network connectivity issue

**Solutions:**
1. Verify credentials in .env
2. Check Gmail security settings
3. Try with a different email service in emailService.js
4. Check server logs for detailed error message

### Issue: Emails sending but not appearing
- Check email spam/junk folder
- Verify recipient email address is correct in database
- Check email headers for delivery delays

---

## Alternative Email Services

To use a different email provider (SendGrid, Mailgun, etc.), modify `emailService.js`:

```javascript
// Example: SendGrid
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const transporter = {
    sendMail: async (mailOptions) => {
        await sgMail.send({
            to: mailOptions.to,
            from: mailOptions.from,
            subject: mailOptions.subject,
            html: mailOptions.html
        });
    }
};
```

---

## Production Deployment

Before deploying to production:

1. **Never commit sensitive credentials** (.env file)
2. **Use environment variables** in production (Vercel, Heroku, Azure)
3. **Set up email domain** for better deliverability:
   - Configure SPF, DKIM, DMARC records
   - Use branded email address instead of personal Gmail
4. **Monitor email delivery** with Mailgun or SendGrid logs
5. **Add email unsubscribe links** for compliance (CAN-SPAM)
6. **Test with real recipients** before full launch

---

## Testing Checklist

- [ ] Email credentials configured in .env
- [ ] nodemailer installed (npm install nodemailer)
- [ ] Server starts without errors (npm start)
- [ ] Created food listing → Email received by restaurant
- [ ] NGO requested food → Email received by restaurant
- [ ] Restaurant approved request → Email received by NGO
- [ ] Restaurant rejected request → Email received by NGO
- [ ] Delivery marked "in transit" → Email received by NGO
- [ ] Delivery marked "delivered" → Email received by NGO
- [ ] All HTML templates render correctly
- [ ] Email links are clickable (if implemented)
- [ ] Error handling works (missing email, network issues)

---

## Performance Notes

- Email sending is **non-blocking** (async/await)
- If email fails, request still completes successfully
- Failed emails are logged to console but don't break transactions
- Consider adding email retry logic for production

---

## GDPR Compliance

The email system includes:
- ✅ User email from database (explicit consent at signup)
- ✅ Transactional emails (account-related, not marketing)
- ✅ No email list sharing with third parties
- ⚠️ TODO: Add unsubscribe option for non-transactional emails
- ⚠️ TODO: Add privacy policy link in email footers

---

**For Questions:** Contact development team or check server logs for detailed diagnostics.
