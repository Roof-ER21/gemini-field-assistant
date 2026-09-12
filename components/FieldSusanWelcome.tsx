import React from 'react';

const starters = [
  { label: 'Plan an inspection', prompt: 'Help me prepare a roof inspection photo checklist.' },
  {
    label: 'Prepare a follow-up',
    prompt: 'Help me draft a homeowner follow-up. Ask me for the details you need.',
  },
  {
    label: 'Practice a conversation',
    prompt: 'Help me explain the inspection process clearly to a homeowner.',
  },
];

export default function FieldSusanWelcome({ onChoose }: { onChoose: (prompt: string) => void }) {
  return (
    <section className="field-susan-welcome" aria-labelledby="field-susan-heading">
      <h1 id="field-susan-heading">What are you working on?</h1>
      <p>Bring Susan your claim question, document, or next homeowner conversation.</p>
      <div className="field-susan-starters">
        {starters.map((starter) => (
          <button
            type="button"
            className="field-action"
            key={starter.label}
            onClick={() => onChoose(starter.prompt)}
          >
            {starter.label}
          </button>
        ))}
      </div>
      <small>
        Choose a starting point, then edit before sending. Check important details against your
        source documents.
      </small>
    </section>
  );
}
