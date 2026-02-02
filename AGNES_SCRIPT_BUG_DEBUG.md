# Agnes 21 Custom Script Bug - Debug Summary

## Problem Statement
Agnes 21 is ignoring user-selected scripts and custom scripts, always using the initial/default script instead.

## Expected Behavior
1. User selects a script from dropdown → Agnes uses that script
2. User enters custom script text → Agnes uses custom script
3. User toggles "Custom Script: ON" → Agnes uses the custom script content

## Files Investigated

### 1. `/Users/a21/gemini-field-assistant/components/AgnesLearningPanel.tsx`
**Key Variables:**
- `scriptId` (state) - Currently selected script ID from dropdown
- `useCustomScript` (state) - Boolean flag for custom script mode
- `customScript` (state) - User-entered custom script text
- `selectedScript` (computed) - Script object from `getScriptById(scriptId)`
- `scriptContent` (computed) - Derived from: `useCustomScript ? customScript : (selectedScript?.content || '')`

**Flow:**
1. Line 20-21: `scriptContent` is derived from state
2. Line 88: Config object created with `script: scriptContent`
3. Line 102: Config passed to `<PitchTrainer config={activeConfig} />`

**Added Debug Logging:**
Lines 89-107 now log:
- useCustomScript flag
- customScript length
- scriptId
- selectedScript details
- scriptContent length and preview
- Final config.script length and scriptId

### 2. `/Users/a21/gemini-field-assistant/agnes21/components/PitchTrainer.tsx`
**Key Logic:**
- Line 55: Receives `config` as prop
- Lines 463-470: Builds system instruction with `config.script`

**Added Debug Logging:**
Lines 463-474 now log:
- config.script length
- config.scriptId
- config.script preview
- config.mode
- config.difficulty
- userDivision

### 3. `/Users/a21/gemini-field-assistant/agnes21/utils/improvedPrompts.ts`
**Key Function:**
- `buildSystemInstruction(mode, difficulty, script, division, scriptId)` (line 1251)
- Parameter `script` is correctly used in 3 places:
  - Line 1337 (COACH mode)
  - Line 1466 (JUST_LISTEN mode)
  - Line 1559 (ROLEPLAY mode)

## Potential Causes

### 1. State Closure Issue ❌ (Unlikely)
The config is created fresh in `handleStart()` with current state values, so stale closures shouldn't be an issue.

### 2. Textarea Value/OnChange Mismatch ✅ (Not the bug)
Checked lines 334-337:
```tsx
<textarea
  value={scriptContent}  // Correct
  onChange={(e) => setCustomScript(e.target.value)}  // Correct
  readOnly={!useCustomScript}  // Prevents editing when not in custom mode
/>
```
This is working as intended.

### 3. Race Condition in State Updates ⚠️ (POSSIBLE)
When user:
1. Changes dropdown (updates `scriptId`)
2. Toggles "Custom Script: ON" (updates `useCustomScript`)
3. Types in textarea (updates `customScript`)

React state updates are asynchronous, but since `scriptContent` is derived from state and `handleStart()` is called after all interactions, this shouldn't cause issues.

### 4. Config Object Not Being Used ⚠️ (NEEDS VERIFICATION)
The most likely bug is that `config.script` is being passed correctly, but somewhere in the Gemini Live session setup, a hardcoded or cached script is being used instead of the dynamic `config.script` value.

## Testing Steps

### Test 1: Verify State Updates
1. Open Agnes Learning Panel
2. Open browser console
3. Select a script from dropdown
4. Click "Start Session"
5. Check console logs for script values

**Expected Output:**
```
=== AGNES SCRIPT DEBUG (AgnesLearningPanel) ===
useCustomScript: false
customScript length: 0
scriptId: <script-id>
selectedScript?.id: <script-id>
selectedScript?.title: <script-title>
scriptContent length: <positive-number>
scriptContent preview: <first-100-chars-of-script>
config.script length: <positive-number>
config.scriptId: <script-id>
===========================================
```

### Test 2: Verify Custom Script
1. Click "Use Custom Script" button
2. Paste a custom script
3. Click "Start Session"
4. Check console logs

**Expected Output:**
```
=== AGNES SCRIPT DEBUG (AgnesLearningPanel) ===
useCustomScript: true
customScript length: <positive-number>
scriptId: <whatever-was-last-selected>
selectedScript?.id: <id>
scriptContent length: <positive-number>
scriptContent preview: <first-100-chars-of-CUSTOM-script>
config.script length: <positive-number>
config.scriptId: undefined
===========================================
```

### Test 3: Verify PitchTrainer Receives Correct Script
After starting session, check console for:
```
=== AGNES SCRIPT DEBUG (PitchTrainer) ===
config.script length: <should-match-AgnesLearningPanel>
config.scriptId: <should-match-AgnesLearningPanel>
config.script preview: <should-match-AgnesLearningPanel>
config.mode: ROLEPLAY | COACH | JUST_LISTEN
config.difficulty: ROOKIE | PRO | etc
userDivision: insurance | retail
==========================================
```

### Test 4: Verify Script is Used in System Instruction
Add a console.log in `buildSystemInstruction` to log the final system instruction length and preview:
```typescript
console.log('System instruction length:', systemInstruction.length);
console.log('Script section preview:', systemInstruction.substring(systemInstruction.indexOf('## TRAINING SCRIPT'), systemInstruction.indexOf('## TRAINING SCRIPT') + 200));
```

## Next Steps
1. Run the application
2. Perform tests 1-3 above
3. Analyze console output to identify where the script value is lost
4. If script is correct in PitchTrainer but Agnes still uses wrong script, investigate Gemini Live session initialization

## Hypothesis
Based on code review, the most likely issue is that the script is being passed correctly through the entire chain, but Agnes may be:
1. Using a cached/previous session's system instruction
2. Ignoring the system instruction parameter in the Gemini Live session
3. Having the system instruction overridden by a session reconnection

The debug logs will reveal which of these is the actual issue.
