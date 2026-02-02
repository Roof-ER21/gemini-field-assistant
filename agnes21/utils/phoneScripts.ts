/**
 * Phone Call Scripts for Agnes-21
 * Scripts for various customer scenarios
 */

export interface PhoneScript {
  id: string;
  title: string;
  category: 'estimate' | 'objection' | 'authorization' | 'pushback' | 'retail' | 'door-to-door';
  division: 'insurance' | 'retail' | 'both';
  content: string;
  description: string;
  voice?: 'agnes_21' | '21' | 'reeses_piecies'; // Optional voice selection for TTS
}

export const PHONE_SCRIPTS: PhoneScript[] = [
  {
    id: 'initial-pitch',
    title: 'Initial Pitch',
    category: 'door-to-door',
    division: 'insurance',
    description: 'Primary door-to-door pitch covering the 5 non‑negotiables',
    content: `Initial Pitch

5 Non-negotiables with every pitch
• Who you are
• Who we are and what we do (Roof ER)
• Make it relatable
• What you’re there to do (an inspection)
• Go for the close (them agreeing to the inspection)

Knock on door/ring doorbell 
As they are opening the door, smile and wave. 
• "Hi, how are you? My Name is ________ with Roof- ER we’re a local roofing company that specializes in helping homeowners get their roof and/or siding replaced, paid for by their insurance!"

• Generic
• "We’ve had a lot of storms here in Northern Virginia/Maryland over the past few months that have done a lot of damage! 
• "We’re working with a lot of your neighbors in the area. We’ve been able to help them get fully approved through their insurance company to have their roof (and/or siding) replaced."
• OR
• Specific
• "Were you home for the storm we had in ___. Wait for answer
• If yes "It was pretty crazy right?! Wait for answer 
• If no: "Oh no worries at all, we get that all the time.
• If yes move on to next line
• "We’re working with a lot of your neighbors in the area. We’ve been able to help them get fully approved through their insurance company to have their roof (and/or siding) replaced."

• "While I’m here, in the neighborhood, I am conducting a completely free inspection to see if you have similar, qualifiable damage. If you do, I’ll take a bunch of photos and walk you through the rest of the process. If you don’t, I wouldn’t want to waste your time, I wouldn’t want to waste mine! I will at least leave giving you peace of mind that you’re in good shape."
• Once they agree to let you do the inspection:, "Alright! It will take me about 10 - 15 minutes. I’m gonna take a look around the perimeter of your home, then grab the ladder, and take a look at your roof.
• Go in for a handshake. What was your name again? [Their name] great to meet you, again I am (your name). Oh and by the way do you know who your insurance company is"? Wait for their answer, "Great! We work with those guys all the time."
• "I will give you a knock when I finish up and show you what I’ve found."`
  },
  {
    id: 'post-inspection-pitch',
    title: 'Post-Inspection Pitch',
    category: 'door-to-door',
    division: 'insurance',
    description: 'Follow-up pitch after completing the roof inspection',
    content: `Post-Inspection Pitch

• Knock on the door 

• "Hey _______, so I have a bunch of photos to show you. First I walked around the INTEGRITY

• Start showing the pictures of damage to screens, gutters, downspouts, and soft metals

• "While this damage functionally isn’t a big deal, it really helps build a story. Think of us like lawyers and this collateral damage is the evidence that builds the case which helps us get the roof and/or siding approved."
• QUALITY

• "Here are the photos of the damage to your shingles. Anything I have circled means its hail damage (IF there were any wind damaged shingles or missing shingles say:) and anything I have slashed means its wind damage. 

• Remain on a photo of hail damage as you explain the following

• "This is exactly what we look for when we're looking for hail damage. If you notice, the divot is circular in nature. Even if this damage doesn’t look like a big deal, what happens over time, these hail divots fill with water, freeze…., when water freezes it expands and breaks apart the shingle which will eventually lead to leaks. That is why your insurance company is responsible and your policy covers this type of damage." 

• Start slowly swiping through all the pictures of hail. 
SIMPLICITY
• "As you can see there is quite a bit of damage. 

• Start slowly swiping through all the pictures of hail. 

• If there was wind damage or missing shingles, say the following:
• "Now here are the wind damaged shingles. You have both shingles that are creased from the wind lifting them up and shingles that have completely been blown off."

• Show the pictures of wind damaged and/or missing shingles (if applicable)

• "This is very similar to damage to ________ home and/or the rest of the approvals we’ve gotten in the area". 

• "With that being said, insurance companies are always looking for ways to mitigate their losses. It’s unfortunate but that’s how they make money. The most important part of this process is that when your insurance company comes out to run their inspection, we are here as storm experts to make sure you as a homeowner get a fair shake. If they are missing anything we make sure they see all the damage that I just showed you."`
  },
  {
    id: 'full-approval-estimate',
    title: 'Full Approval Estimate Phone Call',
    category: 'estimate',
    division: 'insurance',
    description: 'Call to make when you receive a full approval estimate from insurance',
    content: `Full Approval Estimate Phone Call

This is the call you will make to your HO as soon as you receive the estimate

"Hello sir/ma'am! It's [YOUR NAME] with Roof ER. Congratulations, I am glad we were able to ensure that your insurance company fully approved your roof/siding/gutters/etc replacement!

"So the next steps are, as I mentioned last time we met:

"One of our Project Coordinators will be reaching out to you to schedule a Project Meeting to go over your full scope of work.

"Based on the estimate, your insurance company will be sending you [ACV AMOUNT] shortly. This will be used as your down payment. With that, we can start all of your work! When they send you that check, just hold on to it until your meeting with our Project Coordinator who will help with all the next steps.

"Our estimating team will also be sending in supplements to the insurance company based on items they may have missed. This includes Code Items such as IWS and Drip Edge. And don't worry! Even if for some reason they do not approve these amounts, we will still do all the necessary work and never charge you for it. As we talked about earlier, your only cost out of this will be your deductible once we finish all the work.

"Upon completion of the installation, we will review and inspect all of our work to ensure it is to your satisfaction. Then we will send in a completion form once you sign off on the complete project. That's when the insurance company will release the remaining funds minus your deductible. So your final payment will only be those funds plus your deductible.

"Any questions so far, sir/ma'am?"

Answer any questions

"Great! Again, I am glad that we were able to make this happen for you, now you get to experience the quality that Roof ER always delivers, at only the cost of your deductible after your whole project is complete!"

Potentially mention additional work that they may want to add.

Answer any additional questions or engage in any conversation the HO starts.

"Also, if you know anyone else that I can help, have them reach out to me! You have my card - they can call, text, or email me and I can inspect their property to see if they have the same qualifying damage and I can walk them through the same process I have walked you through!

Engage in any conversation that this starts

"Awesome!

If you haven't already put up a yard sign: "Would you mind if I put up a yard sign next time I'm in your area? This will definitely help other companies already know that you're working with someone and hopefully eliminate anyone else from knocking your door asking about your roof/siding."

"Look out for the communication from one of our Project Coordinators so you can get that Project Meeting scheduled to go over all the next steps and your full scope of work. Congratulations again and have a great day!"`
  },
  {
    id: 'partial-estimate-denial',
    title: 'Partial Estimate/Denial Phone Call',
    category: 'estimate',
    division: 'insurance',
    description: 'Call to make when you receive a partial approval or denial',
    content: `Partial Estimate/Denial Phone Call

This is the call you will make to your HO as soon as you receive the estimate

"Hello sir/ma'am! It's [YOUR NAME] with Roof ER. How's it going?"

"Great, well we just received the decision from the insurance company. We're going to have to take some steps to get this turned around. I have already submitted my photo report that demonstrates the damage to your property and the need to replace your whole roof, so hopefully they review and approve that. Could you please reach out to the adjuster to see if they were able to review my report?"

After HO answers. "Thank you! During that call, please let them know that you disagree with their current decision and would like to have your property reinspected if they are not able to update their current decision to a full approval based on the photo report that I sent them."

If there are some approved shingles:

"So we will also be conducting an iTel and Repair Attempt.

"An iTel is where we will take a shingle off your roof and send it in to get tested to verify that it is discontinued. Since it is discontinued, the only effective way to restore your property would be with a full roof replacement.

"At that time, I will also take a video of us removing and replacing that shingle. This Repair Attempt video will demonstrate to the insurance company that your roof is not repairable and therefore would need to be fully replaced.

"To get those scheduled, I will need you to sign these 2 documents allowing us to do that. When you see the documents, it will have a cost attached, but don't worry! Read the bold print and you will see that you, as the homeowner, are never responsible for this cost."

Schedule a time to meet with the HO to sign or let them know you will be sending it out for eSign. Task the proper people for eSign, if necessary.

"We will definitely be putting in the work to give you the highest chance of getting this turned around. I definitely believe your roof has the damage that warrants a full replacement. But, of course, insurance companies are billion dollar, publicly traded companies that will try to save as much money as they can on every claim. That is why it is great that you are working with us since we know the proper steps to ensure that you are adequately taken care of by your insurance company!"

Answer any questions or concerns the HO has.

"Alright, so let me know how the phone call goes with your adjuster and I'll start working on my end to put everything together to get this turned around. Thank you, sir/ma'am, goodbye!"`
  },
  {
    id: 'contingency-claim-auth',
    title: 'Contingency & Claim Authorization',
    category: 'door-to-door',
    division: 'insurance',
    description: 'Script for door-to-door claim authorization after filing',
    content: `Contingency & Claim Authorization

After the claim: "Okay, perfect! Like they said, an adjuster will be reaching out to you in the next 24 to 48 hours to schedule the inspection. The absolute most important part of this process is that I am at this inspection. Insurance companies don't want to pay out. They are trying to mitigate their losses after storms. I am there as your representation to make sure you get a fair shake.

Turn the iPad so you and the homeowner can see.

"This basic/simple agreement backs you as the homeowner by guaranteeing you that your only cost will be your deductible if we get you fully approved. If it is a partial approval or denial, first we will fight and jump through the necessary hoops to turn that into a full approval; but if we are not able to get you fully approved, this contract is null and void and you do not owe us a penny."

"What's in it for us, is we just want to get to do the work. This agreement commits you to using us if we hold up our end of the bargain and achieve a full-approval."

You sign
They sign

"This next form is our Claim Authorization form. Very simple, it allows us to communicate with your insurance company. I'll be here for the inspection and we will also communicate with them through email and phone calls so you don't have to be a middle-man. Of course, I'll always keep you looped in with our communication by CCing you in all emails and updating you on any conversations we have.

They sign

Press Submit enter password "roofer" if it asks.

"Alright, we are all set! Again, the most important part of this process is that I am here when the insurance company comes out. Ideally you can have them call me to schedule that directly. If they call me, great! But, regardless, please get the adjuster's information (name, email, phone number) and send that over to me so that I can communicate with them before the inspection. If they insist on scheduling with you, go ahead and pencil in a time and avoid these times and days [provide your schedule]

Answer any questions that the HO may have

"Thank you, sir/ma'am, looking forward to seeing you on the day of inspection, you have my contact information on my card if you need anything else."`
  },
  {
    id: 'insurance-pushback',
    title: 'Insurance Pushback & Arguments (Q1-Q100)',
    category: 'pushback',
    division: 'insurance',
    description: 'Comprehensive responses to insurance company objections',
    content: `Insurance Pushback & Arguments Playbook

Q1: "We don't see enough damage to warrant replacement."
Short: Our photo report shows functional storm damage (creases, missing shingles) beyond repair. This requires full replacement.

Detailed Email: To whom it may concern, Please see the attached photo report documenting storm-related damage on multiple slopes. The photos clearly show creased and missing shingles, which are consistent with functional wind damage and cannot be repaired without causing further harm. Per standard industry practice, this constitutes irreparability, and a full replacement is required to restore the property to its pre-loss condition. We respectfully request that your estimate be revised accordingly.

Q2: "Hail is cosmetic and doesn't affect function."
Short: Hail damage is not cosmetic - it causes granule loss, mat fractures, and sealant bond failures, per GAF.

Detailed Email: To whom it may concern, Your denial states that hail damage is cosmetic only. However, per GAF Storm Damage Guidelines, hail impact causes functional issues such as granule loss, cracks in the asphalt mat, and compromised sealant bonds. These defects accelerate roof deterioration and shorten lifespan, making the roof irreparable. For these reasons, this damage cannot be dismissed as cosmetic. Please update your estimate to reflect full roof replacement.

Q3: "Shingles can be patched."
Short: The iTel report confirms the shingles are discontinued; patching would cause mismatches and fail manufacturer standards.

Detailed Email: To whom it may concern, Your position that the roof can be patched is not consistent with the findings of the attached iTel report, which confirms that the installed shingles are discontinued. Per the Discontinued Shingle List, no comparable replacements exist. Mixing discontinued shingles with available alternatives creates mismatches in size, color, and sealant bond, violating manufacturer standards. The only viable and code-compliant option is full replacement.

Q4: "We don't see storm-related damage."
Short: Our photo report documents collateral and shingle damage consistent with the reported storm event. Latent storm damage may not be immediately visible.

Detailed Email: To whom it may concern, Your denial states no storm-related damage was found. Please review the attached photo report, which documents collateral impacts to gutters, soft metals, and shingles. These damage patterns are consistent with the storm event reported and align with industry-recognized storm signatures. Additionally, per GAF Storm Damage Guidelines, latent damage from wind or hail may not be visible immediately but still compromises long-term performance. We ask that the scope be reconsidered with this evidence in mind.

Q5: "The roof is still functional."
Short: Coverage isn't based on functionality - cracked shingles and exposed mats void warranties and require replacement.

Detailed Email: To whom it may concern, While you noted the roof is "still functional," coverage is not determined by whether a roof is currently leaking but by restoring the property to its pre-loss condition. The attached documentation shows cracked shingles and exposed fiberglass mats. Per GAF Storm Damage Guidelines, these conditions void the manufacturer's warranty and compromise the integrity of the system. Repair is not feasible, and replacement is required to bring the property back to pre-storm condition.

[Continue with remaining Q&A points as needed...]

For full playbook with all 100 questions, refer to the complete Pushback PDF document.`
  },
  {
    id: 'retail-pitch',
    title: 'The Power Retail Pitch (5-Phase)',
    category: 'retail',
    division: 'retail',
    description: 'Complete 5-phase door-to-door pitch: Hook, Pivot, Close, Stop Signs, Rehash',
    voice: 'agnes_21',
    content: `THE POWER RETAIL PITCH - Full Field Guide
═══════════════════════════════════════════════════════════

PHASE 1: THE HOOK (15 seconds or less)
═══════════════════════════════════════════════════════════
Goal: Establish authority and create curiosity quickly.

"Hi there, how are you? I'll keep this quick—I'm not here to sign anything today. My name is [Name] with Roof ER.

I'm stopping by because we're managing a project for one of your neighbors down the street, and while our crew is active in the area, we're doing complimentary inspections for homes with similar builds."

WHY THIS WORKS:
• "Not here to sign anything" = Lowers guard immediately
• "Neighbor project" = Social proof (FOMO)
• "Similar builds" = Creates relevance

═══════════════════════════════════════════════════════════
PHASE 2: THE PIVOT (Qualification)
═══════════════════════════════════════════════════════════
Goal: Identify the problem BEFORE offering the solution.

"Specifically, I noticed you have..."

CHOOSE YOUR PATH BASED ON VISUAL CUES:

🪟 WINDOWS (Qualifiers: 4+ windows, 10+ years old)
"...the original window frames. Usually when we see these, neighbors mention drafts in winter or the AC running constantly in summer. Have you noticed that, or are they holding up okay?"

🏠 SIDING (Qualifiers: 75% coverage, 10+ years old)
"...some fading or wear on the siding. We're working with homes that have that split-level coverage to update. How long has this siding been up?"
Follow-up: "Once siding hits that 10-15 year mark, moisture can start getting behind it without you even seeing it."

🏗️ ROOFING (Qualifiers: Full replacement only, 15+ years old)
"...some wear on the shingles from the recent weather. When was the last time someone actually got up there to check the integrity?"
Follow-up: "Most homeowners don't think about the roof until there's a leak—by then it's usually caused interior damage."

☀️ SOLAR (Qualifiers: South-facing, minimal tree coverage, 4KW capable)
"...perfect southern exposure with almost no tree coverage. Have you seen your electric bill creeping up like everyone else's?"
Follow-up: "We're finding homes in this area can offset 70-90% of their bill with the right setup."

═══════════════════════════════════════════════════════════
PHASE 3: THE "NO-PRESSURE" CLOSE
═══════════════════════════════════════════════════════════
Goal: Frame it as information delivery, not a sales call.

"Got it. Look, my job is super simple:
1. I get your name
2. Find a time that fits your schedule
3. Leave you with information

We have a specialist in the area tomorrow giving price estimates so you have them for your records. Do mornings or evenings typically work better for you?"

KEY PHRASE: "For your records" = No commitment implied

═══════════════════════════════════════════════════════════
BODY LANGUAGE & TONALITY TIPS
═══════════════════════════════════════════════════════════
✓ Stand at an angle, not directly facing them (less confrontational)
✓ Hold materials in your hand (looks official)
✓ Point when you say "neighbor down the street"
✓ Smile and be conversational, not robotic

TONALITY KEYS:
• "I'm not here to sign anything" = Casual, reassuring
• "Does mornings or evenings work better?" = Confident, assumptive
• "Sound fair?" = Friendly, agreement-seeking

RED FLAGS (Walk Away):
✗ Aggressive "Get off my property" hostility
✗ No qualifying factors (wrong product fit)
✗ Renter (unless doing solar in targeted areas)`
  },
  {
    id: 'retail-stop-signs',
    title: 'Power Pitch Stop Signs (Enhanced Rebuttals)',
    category: 'retail',
    division: 'retail',
    description: 'Enhanced rebuttals for 7 common retail objections with price-lock & inflation framing',
    content: `POWER PITCH "STOP SIGNS" - Enhanced Rebuttals
(Goal: Overcome, reframe, and redirect to schedule a free estimate)

═══════════════════════════════════════════════════════════
🛑 STOP SIGN #1: "I'm not interested."
═══════════════════════════════════════════════════════════

PRIMARY REBUTTAL:
"I totally get that. Most people aren't 'interested' in home projects until something breaks. We're just trying to help you get a price locked in now while our team is here, so you aren't scrambling later when prices go up. Since I'm already here, it doesn't hurt to get the info, right?"

BACKUP OPTION (Pivot to other products):
"Fair enough. We do more than just [product]—windows, siding, roofing, solar. Is there anything else on the home you've thought about updating eventually?"

WHY IT WORKS:
✓ "Until something breaks" plants a seed
✓ "Price locked in" creates urgency without pressure
✓ "Doesn't hurt" is low-commitment ask
✓ Pivot opens new conversation paths

═══════════════════════════════════════════════════════════
🛑 STOP SIGN #2: "I'm busy." / "Not right now."
═══════════════════════════════════════════════════════════

PRIMARY REBUTTAL:
"Totally get it—most people are. This will take 60 seconds right now just to qualify your home, then we'll schedule a time that actually works around your schedule. I just need your name, best phone number, and whether mornings or evenings are better."

ALTERNATIVE (If they seem very rushed):
"My job is really simple—I just get your name, find a time that ACTUALLY works around your busy schedule, and leave a flyer."

WHY IT WORKS:
✓ "60 seconds" gives specific time commitment
✓ Three-step simplicity removes friction
✓ "Actually works" shows flexibility
✓ You're scheduling for THEIR convenience

═══════════════════════════════════════════════════════════
🛑 STOP SIGN #3: "I don't have the money right now."
═══════════════════════════════════════════════════════════

PRIMARY REBUTTAL:
"That's exactly why we're doing this. Material costs keep climbing with inflation. Even if you're not ready today, getting an estimate now gives you a baseline so you know exactly what to budget for. It's about being prepared, not spending money today. Does 4:00 PM or 6:00 PM work better to just get the numbers?"

ALTERNATIVE:
"Makes sense, the [Product] is going to have to wait for a little while, huh? We're not looking to rip out anyone's windows today (lol)—just while the team is in the area, we're leaving everyone with free information on styles and prices, so when you ARE ready, you'll have a price on file to shop around."

WHY IT WORKS:
✓ Reframes "no money" as "more reason to get info NOW"
✓ "Inflation" creates logical urgency
✓ "Baseline to budget" gives practical value
✓ "Not spending money today" removes immediate pressure
✓ Assumptive time close at the end

═══════════════════════════════════════════════════════════
🛑 STOP SIGN #4: "I already have a guy."
═══════════════════════════════════════════════════════════

PRIMARY REBUTTAL:
"That's awesome—it's rare to find a contractor you trust. But does your 'guy' specialize in [product] specifically? We find that generalists often catch different things than specialists. Let us be your 'second opinion'—if his quote is solid, we'll tell you. Worst case, you have a benchmark."

ALTERNATIVE:
"Great! Then you know the value of a second opinion. Most homeowners like having two quotes to compare anyway—it's just smart."

WHY IT WORKS:
✓ Validates their existing relationship
✓ "Generalist vs specialist" plants doubt gently
✓ "If his quote is solid, we'll tell you" = trustworthy
✓ "Just smart" appeals to their intelligence

═══════════════════════════════════════════════════════════
🛑 STOP SIGN #5: "I have to talk to my spouse."
═══════════════════════════════════════════════════════════

PRIMARY REBUTTAL:
"That makes total sense. Actually, we prefer both of you to be there. We cover a lot of options and technical details, and it's easier if you both hear it directly rather than playing 'telephone' later. When's a time you're both typically home?"

ALTERNATIVE:
"Makes sense...that's usually something you guys talk about together, right? The [product]? (lol) My job is simple—I just get your name, a time that works for both of you, and leave you with a flyer."

WHY IT WORKS:
✓ Makes spouse involvement sound like YOUR requirement
✓ "Playing telephone" is relatable problem
✓ Gets commitment for when BOTH are home
✓ Increases show rate when both parties know about it

═══════════════════════════════════════════════════════════
🛑 STOP SIGN #6: "We're just getting ideas right now."
═══════════════════════════════════════════════════════════

PRIMARY REBUTTAL:
"Perfect! That's exactly what this is for. Our goal is to give you real pricing and professional recommendations so when you're ready, you're not starting from scratch. No pressure to move forward—just solid information."

WHY IT WORKS:
✓ Validates their timeline completely
✓ "Not starting from scratch" shows value
✓ "No pressure" removes sales anxiety
✓ Easy yes for "just information"

═══════════════════════════════════════════════════════════
🛑 STOP SIGN #7: "I don't think we need anything right now."
═══════════════════════════════════════════════════════════

REBUTTAL (Same as No Money):
"Makes sense, the [Product] is going to have to wait for a little while, huh? That's exactly why we're coming by—free info so you have a price on file when you're ready. Prices keep going up, so getting a baseline now just makes sense."

═══════════════════════════════════════════════════════════
🎯 POCKET REBUTTALS (Quick Reference)
═══════════════════════════════════════════════════════════

"Not interested." → "Most aren't until something breaks. Get a price now while we're here—it's free info for later. Doesn't hurt, right?"

"No money." → "That's WHY we're doing this—prices keep rising. Get a baseline now to budget smart. 4 PM or 6 PM for numbers?"

"Have a guy." → "Great! Does he specialize in [product]? Let us be your second opinion—smart homeowners always compare."

"Talk to spouse." → "Perfect—we need both of you there anyway. Easier than playing telephone. When are you both home?"

"Busy right now." → "60 seconds to qualify, then we'll schedule for when it works. Just need name, number, mornings or evenings?"

"Just getting ideas." → "Perfect! Real pricing and recommendations so you're ready when the time comes. No pressure."

═══════════════════════════════════════════════════════════
PRO TIPS FOR ALL STOP SIGNS
═══════════════════════════════════════════════════════════

1. NEVER get defensive or argue
2. Always acknowledge their concern FIRST
3. Keep your tone friendly and conversational
4. Remember: you're helping, not selling
5. If they say no twice, leave gracefully with a flyer
6. The goal is to book an appointment, not close a sale
7. Use assumptive time closes ("4 PM or 6 PM?")
8. Keep pivoting until you find what resonates`
  },
  {
    id: 'retail-rehash',
    title: 'The "Sticky" Rehash (Lock It In)',
    category: 'retail',
    division: 'retail',
    description: 'Lock in appointments and prevent cancellations with utility bill commitment',
    content: `THE "STICKY" REHASH - Lock In & Prevent Cancellations
Goal: Confirm all details, create micro-commitment, increase show rate.

═══════════════════════════════════════════════════════════
THE REHASH SCRIPT
═══════════════════════════════════════════════════════════

"Alright, [Homeowner Name], you're all set for [Time/Date].

Just to confirm:
• I have [Full Address] correct?
• Best number for updates is [Phone]?
• And you mentioned [repeat their specific concern—e.g., 'the drafty windows' or 'wanting to see solar options'], right?

═══════════════════════════════════════════════════════════
WHAT TO EXPECT (Set Proper Expectations)
═══════════════════════════════════════════════════════════

"Our specialist will walk through everything—they'll:
• Inspect the [product]
• Take some quick measurements
• Show you styles and options available
• Give you clear pricing options
• Help build a plan that fits your budget

Super straightforward.

═══════════════════════════════════════════════════════════
THE UTILITY BILL ASK (Micro-Commitment)
═══════════════════════════════════════════════════════════

"One quick favor: If you can have a recent utility bill handy, it helps our specialist be precise and not waste a second of your time."

WHY THE UTILITY BILL MATTERS:
✓ It's a small commitment that INCREASES show-rate
✓ Makes them feel invested in the appointment
✓ Prepares them for a productive conversation
✓ Especially critical for Solar appointments

═══════════════════════════════════════════════════════════
THE REASSURANCE CLOSE
═══════════════════════════════════════════════════════════

"Again, we're not ripping out windows on the spot. Worst case, you get expert advice and numbers for the future. Best case, we help you fix the issue for good. Sound fair?"

KEY PHRASES:
• "Not ripping out windows" = Removes immediate sales pressure
• "Worst case / Best case" = Both outcomes are positive
• "Sound fair?" = Gets verbal agreement (micro-yes)

═══════════════════════════════════════════════════════════
SPOUSE REMINDER (If applicable)
═══════════════════════════════════════════════════════════

"It's important that both decision-makers are there—it helps speed things up and avoids back-and-forth. We need [Spouse Name] there too, right?"

═══════════════════════════════════════════════════════════
🔒 STICKY REHASH CHECKLIST
═══════════════════════════════════════════════════════════

Before you leave, CONFIRM:
☑️ Full address correct
☑️ Best phone number for updates
☑️ Their specific concern/need (repeat it back)
☑️ Appointment date and time
☑️ Both decision-makers will be present
☑️ Asked them to have utility bill ready
☑️ "Sound fair?" agreement received
☑️ Left flyer with your contact info

═══════════════════════════════════════════════════════════
IF THEY SEEM HESITANT AT THE END
═══════════════════════════════════════════════════════════

"Look, I get it—no one loves appointments. But worst case, you walk away with free expert advice and numbers to plan for later. Best case, we knock it out and you don't have to think about it again. Either way, it's a win for you."

═══════════════════════════════════════════════════════════
EXAMPLE SMOOTH REHASH
═══════════════════════════════════════════════════════════

Marketer: "Perfect, Mike. So I have 123 Main Street, 555-0123, and you mentioned the upstairs getting hot. Our specialist will show you energy-efficient options and give you clear pricing. Oh, and if you can have a recent utility bill handy, it helps them be super precise. We're not ripping out windows tomorrow—just getting you solid info. Worst case, you know what to budget for. Best case, we fix it for good. Sound fair?"

Homeowner: "Yeah, sounds good."

Marketer: "Awesome! You'll see our specialist at 6 PM tomorrow. Thanks, Mike!"`
  },
  {
    id: 'retail-qualifiers',
    title: 'Product Qualifiers & Visual Cue Pivots',
    category: 'retail',
    division: 'retail',
    description: 'Minimum requirements and visual cue pivot scripts for each product',
    content: `PRODUCT QUALIFIERS & VISUAL CUE PIVOTS
(Know these BEFORE setting an appointment)

═══════════════════════════════════════════════════════════
🪟 WINDOWS
═══════════════════════════════════════════════════════════

MINIMUMS:
• 4+ windows (common residential sizes) OR 1 Bay/Bow window
• 10 years old or older

VISUAL CUE PIVOT SCRIPT:
"...the original window frames. Usually when we see these, neighbors mention drafts in winter or the AC running constantly in summer. Have you noticed that, or are they holding up okay?"

What You're Doing: Planting a seed. Even if they say "they're fine," you've made them think about it.

QUALIFYING QUESTIONS:
- "About how many windows are you thinking about?"
- "How old are your current windows?"
- "Are they single or double pane?"

DON'T SET APPOINTMENT IF:
✗ Less than 4 windows (and no bay/bow)
✗ Windows less than 10 years old
✗ Already has brand new windows

═══════════════════════════════════════════════════════════
🏠 SIDING
═══════════════════════════════════════════════════════════

MINIMUMS:
• 75% coverage of home OR entire level (e.g., split level)
• 10 years old or older

VISUAL CUE PIVOT SCRIPT:
"...some fading or wear on the siding. We're working with homes that have that split-level coverage to update. How long has this siding been up?"

Follow-up: "Once siding hits that 10-15 year mark, moisture can start getting behind it without you even seeing it."

QUALIFYING QUESTIONS:
- "Are you thinking about the whole house or just part of it?"
- "Is it the original siding or has it been replaced?"
- "How old is the current siding?"

DON'T SET APPOINTMENT IF:
✗ Just a small patch or repair
✗ Less than 75% coverage
✗ Siding less than 10 years old

═══════════════════════════════════════════════════════════
🏗️ ROOFING
═══════════════════════════════════════════════════════════

MINIMUMS:
• Full replacement estimate only (no repairs)
• 15 years old or older

VISUAL CUE PIVOT SCRIPT:
"...some wear on the shingles from the recent weather. When was the last time someone actually got up there to check the integrity?"

Follow-up: "Most homeowners don't think about the roof until there's a leak—by then it's usually caused interior damage."

QUALIFYING QUESTIONS:
- "How old is your current roof?"
- "Have you had any leaks or issues?"
- "Is it the original roof or has it been replaced?"

DON'T SET APPOINTMENT IF:
✗ Just needs a repair (refer to service dept)
✗ Roof less than 15 years old
✗ Recently replaced

═══════════════════════════════════════════════════════════
☀️ SOLAR
═══════════════════════════════════════════════════════════

MINIMUMS:
• South-facing roof (predominantly)
• Minimal tree coverage/interference
• 4KW system capability
• Utility bill gathering preferred
• Targeted zip code preferred

VISUAL CUE PIVOT SCRIPT:
"...perfect southern exposure with almost no tree coverage. Have you seen your electric bill creeping up like everyone else's?"

Follow-up: "We're finding homes in this area can offset 70-90% of their bill with the right setup."

QUALIFYING QUESTIONS:
- "Which direction does your roof face?"
- "Are there any trees that shade your roof?"
- "Do you own the home?"
- "What's your average monthly electric bill?"

DON'T SET APPOINTMENT IF:
✗ North-facing roof only
✗ Heavy tree coverage
✗ Renter (not owner)
✗ Very low electric bill (under $100/month)

═══════════════════════════════════════════════════════════
📊 QUICK REFERENCE TABLE
═══════════════════════════════════════════════════════════

| Product  | Minimums                                    |
|----------|---------------------------------------------|
| Windows  | 4+ windows OR 1 bay/bow, 10+ years old      |
| Siding   | 75% coverage OR full level, 10+ years old   |
| Roofing  | Full replacement only, 15+ years old        |
| Solar    | South-facing, no trees, 4KW capable         |

═══════════════════════════════════════════════════════════
🎯 QUALIFYING TIPS
═══════════════════════════════════════════════════════════

1. Ask qualifying questions naturally in conversation
2. Don't interrogate - keep it friendly
3. PIVOT when they don't qualify:
   "Windows might not make sense right now, but what about the roof? How old is that?"
4. Always leave a flyer even if they don't qualify
5. A good lead today is worth more than a wasted appointment
6. Use visual cues before you even ask questions—notice what you see`
  }
];

/**
 * Get script by ID
 */
export const getScriptById = (id: string): PhoneScript | undefined => {
  return PHONE_SCRIPTS.find(script => script.id === id);
};

/**
 * Get scripts by category
 */
export const getScriptsByCategory = (category: PhoneScript['category']): PhoneScript[] => {
  return PHONE_SCRIPTS.filter(script => script.category === category);
};

/**
 * Get all script categories
 */
export const getScriptCategories = (): PhoneScript['category'][] => {
  return ['estimate', 'objection', 'authorization', 'pushback', 'retail', 'door-to-door'];
};

/**
 * Get scripts by division
 */
export const getScriptsByDivision = (division: 'insurance' | 'retail'): PhoneScript[] => {
  return PHONE_SCRIPTS.filter(script => script.division === division || script.division === 'both');
};
