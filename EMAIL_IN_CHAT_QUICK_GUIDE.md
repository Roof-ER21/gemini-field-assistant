# Email Generation in Chat - Quick User Guide

## How to Generate Emails in Chat

### Method 1: Quick Action Button
1. Look for the **Mail icon** (✉️) in the chat input area
2. Click the Mail icon
3. A dialog will appear

### Method 2: Type Commands
Type any of these commands in the chat:
- `/email`
- `/write email`
- `/draft email`
- "generate an email about [topic]"
- "write an email to the adjuster about [topic]"

### Fill Out the Dialog

**Step 1: Select Recipient Type**
Choose who the email is for:
- 👨‍💼 **Insurance Adjuster** - Most common (70% of emails)
- 🏠 **Homeowner** - For customer communications
- 🏢 **Insurance Company** - For formal corporate communications
- 📧 **Other** - Custom recipient

**Step 2: Choose Tone**
Select the appropriate tone:
- 💼 **Professional** - Default for adjusters and business communications
- 📋 **Formal** - For corporate/legal communications
- 😊 **Friendly** - For homeowners and warm customer interactions

**Step 3: Enter Key Points**
Describe what the email should include. Examples:
- "Partial approval for hail damage, requesting full replacement due to Maryland matching requirements"
- "Following up after adjuster meeting, need reinspection for additional damage found"
- "Customer requesting review of estimate, brittle shingles failed test"

**Step 4: Generate**
Click **"Generate Email"** button

## Understanding the Email Card

When Susan generates your email, it appears in a special card format:

### Header Section
```
✉️ Generated Email
To: Adjuster • Tone: Professional     [Shield Icon] 92/100
```

### Compliance Score
- **🛡️ Green Check (80-100)**: Email is compliant and safe to send
- **⚠️ Yellow Alert (60-79)**: Has warnings, review carefully
- **🚫 Red X (0-59)**: Critical violations, must fix before sending

### Compliance Warnings (if any)
Shows specific issues found:
```
⚠️ Compliance Warnings
WARNING: 2 high-risk phrase(s) found. Review carefully before sending.

• Found: "insurance is required to" - You're interpreting insurance
  regulations - that's unlicensed public adjuster activity.
```

### Email Body
The actual email text appears in a clean, readable format with proper spacing.

### Action Buttons
1. **📋 Copy Email** - Copies the email text to clipboard
2. **✏️ Edit in Email Panel** - Opens the email in the full Email Panel for further editing and compliance checking
3. **👥 Share with Team** - Opens share modal to send to team members

## Example Usage Scenarios

### Scenario 1: Quick Email to Adjuster
**User types:** `/email`

**Dialog fills out:**
- Recipient: Adjuster
- Tone: Professional
- Key Points: "Following up on our meeting yesterday. Attached photos show additional storm damage found during inspection. Requesting reinspection to update estimate."

**Result:** Professional email ready to copy and send

### Scenario 2: Homeowner Update
**User types:** "write an email to Mrs. Johnson about her claim status"

**Dialog fills out:**
- Recipient: Homeowner
- Tone: Friendly
- Key Points: "Claim approved by insurance, work scheduled for next week, what to expect during installation"

**Result:** Warm, customer-friendly email

### Scenario 3: Maryland Matching Argument
**User types:** "generate email about Maryland matching requirements"

**Dialog fills out:**
- Recipient: Adjuster
- Tone: Professional
- Key Points: "Partial approval received, but Maryland building codes require contractors to ensure uniform appearance. Cannot perform work that violates code requirements."

**Result:** Compliant email using contractor authority (not insurance interpretation)

## Compliance Quick Tips

### ✅ GOOD Language (Susan uses these automatically)
- "As the licensed contractor, I am required to..."
- "Maryland building codes require that contractors..."
- "Mr. Smith has requested that we share..."
- "From a construction standpoint..."
- "To meet code compliance..."

### ❌ BAD Language (Susan avoids these)
- "Insurance is required to..."
- "We request the claim be updated..."
- "A full replacement is warranted..."
- "Your policy should cover..."
- "On behalf of the homeowner..."

## State-Specific Features

If you have a state selected (VA/MD/PA):
- Email automatically uses that state's building codes
- Maryland: Emphasizes matching requirements in building codes
- Virginia/Pennsylvania: Uses repairability and manufacturer spec arguments
- State context appears in the dialog: "Email will use **MD** building codes and regulations"

## Tips for Best Results

1. **Be Specific**: Include claim numbers, damage types, specific requests
2. **Provide Context**: Mention recent meetings, inspections, or findings
3. **Use Conversation History**: Susan uses recent chat messages for context
4. **Review Compliance**: Always check the compliance score before sending
5. **Edit if Needed**: Use "Edit in Email Panel" for detailed customization

## Keyboard Shortcuts

- Type `/email` for fastest access
- Press `Escape` to close the email dialog
- Click outside the dialog to close

## Integration with Email Panel

Generated emails can be:
- **Copied** directly to clipboard for sending via your email client
- **Edited** in the full Email Panel for advanced features like:
  - Template selection
  - Variable insertion (customer name, claim number, etc.)
  - AI enhancement (improve, shorten, lengthen)
  - "Talk About It" conversational refinement
  - Full compliance auto-fix

## Troubleshooting

**Dialog won't open?**
- Make sure you're not in the middle of typing a message
- Try clicking the Mail icon instead of using commands

**Email has compliance warnings?**
- Review the specific warnings shown
- Use "Edit in Email Panel" to access auto-fix features
- Adjust key points to focus on contractor authority and building codes

**Generated email doesn't match expectations?**
- Add more specific details in the key points
- Include recent conversation context in chat before generating
- Try different tone settings

**Can't copy email?**
- Some browsers require clipboard permissions
- Use "Edit in Email Panel" and copy from there

## Support

For issues or questions, check:
- Email Panel documentation for compliance guidelines
- Building code references for your state (VA/MD/PA)
- emailComplianceService.ts for complete compliance rules

---

**Remember**: All generated emails follow strict compliance guidelines to prevent unlicensed public adjuster activity. When in doubt, focus on what YOU as the contractor are required to do by building codes, not what insurance "must" do.
