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
  },
  {
    id: 'retail-product-deep-dive',
    title: 'Product Deep Dive — Know What You Sell',
    category: 'retail',
    division: 'retail',
    description: 'Master all 9 products so you can answer any question and pivot confidently between them',
    voice: 'agnes_21',
    content: `PRODUCT DEEP DIVE — ANSWER ANY QUESTION ON THE SPOT
═══════════════════════════════════════════════════════════

The difference between a GOOD marketer and a GREAT marketer is product knowledge.
When a homeowner asks "Why should I replace my windows?" — you need to answer
with confidence AND specifics, not vague sales talk.

═══════════════════════════════════════════════════════════
🪟 WINDOWS — The Energy Play
═══════════════════════════════════════════════════════════

PAIN POINTS TO IDENTIFY:
• Drafty rooms in winter (feel around frames)
• AC running nonstop in summer (high utility bills)
• Condensation between panes (seal failure)
• Hard to open/close (warped frames)
• Street noise coming through (single pane)

VALUE SCRIPT:
"Your windows are like the lungs of your home. When they're old, your house
can't breathe properly — your HVAC works overtime, your bills go up, and
you lose comfort. New windows can cut your energy bills by 10-30%. Plus,
our windows come with a LIFETIME warranty — for the life of YOU, not the
product. These are the last windows you'll ever buy."

KEY STATS:
• 10-30% energy savings
• 2-4% home value increase
• Lifetime warranty (covers the PERSON, not years)
• Eliminates drafts, allergens, mold risk

COMMON QUESTION: "How much do windows cost?"
→ "It depends on the size and style — that's exactly what the free quote is for.
Our specialist will measure your specific windows and give you clear pricing
options. No guessing, no pressure."

═══════════════════════════════════════════════════════════
🏠 SIDING — The Protection Play
═══════════════════════════════════════════════════════════

PAIN POINTS TO IDENTIFY:
• Fading or discoloration
• Warping or buckling panels
• Gaps where moisture can enter
• Peeling paint (wood siding)
• Dents (aluminum siding)

VALUE SCRIPT — VINYL:
"Siding is your home's armor. Once it starts failing, moisture gets behind it
and you don't even know until you've got mold or structural damage. Our
vinyl siding system comes with a TRUE lifetime warranty — covers you, the
owner, forever. Low maintenance, never needs painting, and instantly
upgrades your curb appeal."

VALUE SCRIPT — JAMES HARDIE:
"If you want the premium look, James Hardie is the gold standard. It's
fire-resistant, hail-resistant, termites can't touch it, and it performs
for 30+ years. It comes in hundreds of colors and styles — board and batten,
cedar shake, traditional lap. It's the last siding you'll ever need."

KEY STATS (VINYL):
• TRUE Lifetime warranty (covers owner, not years)
• No painting, no maintenance
• Moisture protection with proper house wrap

KEY STATS (HARDIE):
• 30+ year lifespan
• Fire, hail, insect, temperature resistant
• 2-4% home value increase
• Hundreds of color/style options

═══════════════════════════════════════════════════════════
🏗️ ROOFING — The Urgency Play
═══════════════════════════════════════════════════════════

PAIN POINTS TO IDENTIFY:
• Missing or curling shingles
• Black streaks (algae growth)
• Visible wear from age (15+ years)
• Leaks or water stains inside
• Neighbors getting new roofs

VALUE SCRIPT:
"Your roof is the one thing protecting everything inside your home. Once
shingles start failing, water gets in and causes damage you can't see —
rotted decking, mold, insulation damage. Roof ER is Master Elite with GAF,
which means we're in the top 0.01% of roofers nationwide. Our system
includes a 50-year non-prorated warranty, 30 years of workmanship coverage,
unlimited wind speed, and Class 4 hail impact rating."

KEY STATS:
• 50-year non-prorated warranty
• 30-year workmanship coverage
• Unlimited wind speed + Class 4 hail rating
• Master Elite / President Club with GAF (top 0.01%)
• 2-4% home value increase

═══════════════════════════════════════════════════════════
☀️ SOLAR — The Savings Play
═══════════════════════════════════════════════════════════

PAIN POINTS TO IDENTIFY:
• High electric bills (ask: "Has your bill been going up?")
• South-facing roof with good exposure
• Interest in green energy / sustainability
• Concern about rising utility rates

VALUE SCRIPT — PURCHASE:
"Solar is the only home improvement that literally pays you back. With
federal tax incentives and net metering credits, most homeowners offset
70-90% of their electric bill. Your home value goes up 4-6%, and homes
with solar sell faster. We connect you with solar tax professionals who
maximize every dollar of incentives."

VALUE SCRIPT — PPA:
"With a Power Purchase Agreement, you get solar with ZERO upfront cost.
You buy the power the panels produce — at a lower rate than the utility
company charges. At the end of the contract, you can extend, buy the
system, or have it removed. Clean energy, lower bills, no investment."

═══════════════════════════════════════════════════════════
🏠 MORE PRODUCTS — QUICK REFERENCE
═══════════════════════════════════════════════════════════

INSULATION:
"Proper insulation saves money, increases comfort, and makes your home
quieter. If your attic isn't insulated right, your HVAC is working overtime."
→ Energy efficiency, sound barrier, HVAC protection

GARAGE DOORS:
"A new garage door is the #1 ROI home improvement — better security,
insulation, and instant curb appeal upgrade."
→ Insulated panels, modern styles, stronger security

GUTTERS:
"Clogged gutters cause foundation damage, trim rot, and landscaping
erosion. Our seamless systems with covers prevent all of that."
→ Seamless, larger, gutter covers available

═══════════════════════════════════════════════════════════
🎯 THE PRODUCT PIVOT — CHAIN SELLING
═══════════════════════════════════════════════════════════

Never walk away with just one "no." When they don't qualify for one product,
PIVOT smoothly:

"Windows might not make sense right now, but I noticed [visual cue].
What about the [next product]? How old is that?"

PIVOT CHAIN: Windows → Siding → Roofing → Solar → Gutters → Insulation

PIVOT SCRIPT:
"Totally fair — the windows are in good shape. We actually do more than
just windows. Have you looked at your siding recently? Once it hits that
10-15 year mark, moisture can start getting behind it without you even
seeing it. How long has yours been up?"

GOLDEN RULE: Always leave with SOMETHING. A flyer, a name, a future
appointment — never leave empty-handed.`
  },
  {
    id: 'retail-full-conversation',
    title: 'The Full Conversation Flow (Start to Finish)',
    category: 'retail',
    division: 'retail',
    description: 'Complete door-knock conversation from approach to departure, with branching paths for every response',
    voice: 'agnes_21',
    content: `THE FULL CONVERSATION FLOW — START TO FINISH
═══════════════════════════════════════════════════════════
This is the complete conversation from walking up the driveway
to leaving with an appointment or a flyer. Follow this flow.

═══════════════════════════════════════════════════════════
STEP 1: THE APPROACH (Before the door opens)
═══════════════════════════════════════════════════════════

• Walk with confidence — don't skulk or hesitate
• Doorbell Sandwich: Knock → pause → ring → knock again
• Take TWO steps back (Broomstick Theory)
• Smile BEFORE the door opens
• Materials in hand (clipboard, flyer)
• If you see them through a window, WAVE

═══════════════════════════════════════════════════════════
STEP 2: THE ICE BREAKER (First 5 seconds)
═══════════════════════════════════════════════════════════

Door opens. Smile. Make eye contact.

"Hello! How are you?"

WAIT for their response. React naturally.

If they say "Good" → "Awesome! You look like you're getting stuff done today, I'll be quick."
If they say "Busy" → "I hear you! I'll be super quick, 30 seconds."
If they say "What do you want?" → Stay calm. "Great question — I'll keep this quick."
If they don't answer → "I'll be quick, I promise."

═══════════════════════════════════════════════════════════
STEP 3: THE HOOK (Next 10 seconds)
═══════════════════════════════════════════════════════════

"My name is ___________."

[Pause — let them process]

"I'm just giving the neighbors a heads up."

[Pause — create curiosity]

"Our company Roof ER is about to do the [PRODUCT] for one of your
neighbors right down the street." [POINT toward a house]

"So before we get going, we're coming by and doing free quotes
for everyone."

═══════════════════════════════════════════════════════════
STEP 4: THE PIVOT (Product Qualification)
═══════════════════════════════════════════════════════════

Look at the house. What do you notice?

IF OLD WINDOWS → "I actually noticed your window frames look like
the originals. Have you noticed any drafts or the AC working
harder than it should?"

IF WORN SIDING → "I noticed some wear on the siding. How long
has that been up? Once it hits 10-15 years, moisture can start
getting behind it."

IF OLD ROOF → "I noticed some wear on the shingles. When was
the last time someone got up there to check?"

IF SOUTH-FACING → "I noticed you've got perfect southern
exposure. Has your electric bill been climbing?"

IF NOTHING OBVIOUS → "What would you say is the next big
thing on your home improvement list?"

═══════════════════════════════════════════════════════════
STEP 5: THE CLOSE
═══════════════════════════════════════════════════════════

"Great! So far, we're coming by for everybody in the afternoons —
or are the evenings better for you?"

[If they give a time → move to Rehash]
[If they object → use the Stop Sign rebuttal]
[If they say no twice → leave gracefully with flyer]

═══════════════════════════════════════════════════════════
STEP 6: THE REHASH (After they agree)
═══════════════════════════════════════════════════════════

"Perfect! Just to confirm:
• I have [address] correct?
• Best number for updates is [phone]?
• And you mentioned [their specific concern], right?

Our specialist will inspect the [product], take measurements,
show you options, and give you clear pricing. Super straightforward.

One quick favor — if you can have a recent utility bill handy,
it helps them be precise.

Again, we're not ripping out [product] on the spot. Worst case,
you get expert advice and numbers for the future. Best case,
we fix the issue for good. Sound fair?"

═══════════════════════════════════════════════════════════
STEP 7: THE GRACEFUL EXIT
═══════════════════════════════════════════════════════════

IF APPOINTMENT SET:
"Awesome! You'll see our specialist at [time]. Thanks, [name]!
Have a great [day/evening]." [Shake hand if offered]

IF NO APPOINTMENT:
"No worries at all! Here's my card and a flyer with our info.
If anything comes up or you change your mind, give us a call.
Have a great [day/evening]!" [Smile, wave, leave clean]

NEVER:
✗ Get frustrated or show disappointment
✗ Try a third time after two clear "no"s
✗ Make them feel guilty for saying no
✗ Linger after the conversation is over

ALWAYS:
✓ Thank them for their time
✓ Leave a flyer
✓ Be the person they remember positively
✓ Walk with the same confidence you arrived with

═══════════════════════════════════════════════════════════
💡 THE MINDSET
═══════════════════════════════════════════════════════════

You are NOT selling anything. You are:
• Giving neighbors a heads up
• Offering free information
• Helping them plan for the future
• Being a professional who respects their time

If you believe that, they will too.`
  },
  {
    id: 'retail-curveball-scenarios',
    title: 'Curveball Scenarios — Expect the Unexpected',
    category: 'retail',
    division: 'retail',
    description: 'Real-world situations that throw you off script: dogs, multiple homeowners, language barriers, previous bad experiences, and more',
    voice: 'agnes_21',
    content: `CURVEBALL SCENARIOS — EXPECT THE UNEXPECTED
═══════════════════════════════════════════════════════════
The field is unpredictable. These scenarios test your ability to
stay composed, adapt, and still close when things go sideways.

═══════════════════════════════════════════════════════════
🐕 CURVEBALL: The Dog Situation
═══════════════════════════════════════════════════════════

They open the door and a large dog barks aggressively.

DO: Stand still. Don't reach toward the dog. Say "Beautiful
dog! What's their name?" — Let them handle the dog.

DON'T: Jump back, show fear, or ask them to put it away.

TRANSITION: "I love dogs. I'll keep this quick so you can
get back to [dog name]. I'm just giving the neighbors a
heads up..."

═══════════════════════════════════════════════════════════
👥 CURVEBALL: Multiple People at the Door
═══════════════════════════════════════════════════════════

Two or more people answer — spouse, roommate, parent.

DO: Address BOTH people. "Hi there, how are you both?"
Make eye contact with each person. Include them both in
the conversation.

ADVANTAGE: Both decision-makers are already present.
Skip the "talk to my spouse" objection entirely.

CLOSE: "Since you're both here, what time works for
both of you? Mornings or evenings?"

═══════════════════════════════════════════════════════════
🌍 CURVEBALL: Language Barrier
═══════════════════════════════════════════════════════════

They don't speak English well or at all.

DO: Slow down. Use simple words. Smile more.
If you speak Spanish/another language, USE IT.

KEY PHRASES TO SIMPLIFY:
"Free" → hold up a flyer, point to "FREE"
"Neighbor" → point to the house
"Appointment" → point to your calendar/phone

IF TOTAL BARRIER: "Is there someone who speaks English
at home?" or leave a flyer with your number and point
to the phone number.

DON'T: Talk louder (they're not deaf), get frustrated,
or walk away without leaving info.

═══════════════════════════════════════════════════════════
😤 CURVEBALL: They've Been Burned Before
═══════════════════════════════════════════════════════════

"Last time someone came to my door like this, they took
my deposit and never came back."

THIS IS YOUR MOMENT. Don't get defensive.

RESPONSE: "I'm really sorry that happened to you. That's
not what we're about. Roof ER is a licensed, insured
company — we've been serving this area for years.
Here's our card — you can look us up, check our reviews,
call our office. We don't take deposits at the door. My
job is just to get your name and set up a time for a
FREE quote. No money, no commitment."

FOLLOW UP: "Would it help if I gave you our main office
number so you can verify we're legit before the
appointment?"

═══════════════════════════════════════════════════════════
📱 CURVEBALL: They Answer Through a Ring Camera
═══════════════════════════════════════════════════════════

You hear "Can I help you?" through the doorbell camera.

DO: Look directly at the camera. Smile. Speak clearly.
Treat it exactly like a face-to-face conversation.

SCRIPT: "Hi! My name is [name] with Roof ER. I'm just
stopping by to let the neighbors know we're doing work
down the street and offering free quotes. If you're
interested, I can leave a flyer with my info."

DON'T: Look around nervously, talk to the door instead
of the camera, or keep ringing.

═══════════════════════════════════════════════════════════
👶 CURVEBALL: Baby Crying / Kids Chaos
═══════════════════════════════════════════════════════════

They open the door with a crying baby or kids running
around behind them.

DO: Acknowledge it warmly. "Busy house! I'll make this
super quick — 20 seconds."

SPEED UP your pitch. Hit the hook and close fast.

"We're doing free quotes in the area. My job is simple —
name, time that works, and I leave a flyer. Afternoons
or evenings better for you?"

DON'T: Try to do the full pitch. Read the room.

═══════════════════════════════════════════════════════════
🏗️ CURVEBALL: They Already Got Work Done Recently
═══════════════════════════════════════════════════════════

"We just got a new roof last year."

PIVOT: "That's awesome — glad it's handled! We actually
do a lot more than just roofs. Windows, siding, gutters,
solar, insulation, garage doors. Is there anything else
on the home you've been thinking about updating?"

ALWAYS PIVOT. Never leave after one product no.

═══════════════════════════════════════════════════════════
🏘️ CURVEBALL: HOA Restrictions
═══════════════════════════════════════════════════════════

"We have an HOA, we can't just do whatever we want."

RESPONSE: "Totally understand — we work with HOAs all the
time. Our specialist can actually help you navigate the
approval process. We bring color samples and specs that
match HOA guidelines. Sound helpful?"

═══════════════════════════════════════════════════════════
🎯 THE GOLDEN RULE FOR ALL CURVEBALLS
═══════════════════════════════════════════════════════════

1. PAUSE — Don't react instantly
2. ACKNOWLEDGE — Show you heard them
3. ADAPT — Adjust your approach
4. REDIRECT — Get back to the close
5. STAY WARM — Never let frustration show

The best marketers don't just handle objections — they
handle SITUATIONS. That's what separates you from everyone
else knocking on doors.`
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
