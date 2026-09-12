import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EmailPanel from '../../components/EmailPanel';
import KnowledgePanel from '../../components/KnowledgePanel';
import AgnesLearningPanel from '../../components/AgnesLearningPanel';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  warning: vi.fn(),
  log: vi.fn(),
  search: vi.fn(),
  docs: vi.fn(),
  division: 'insurance',
}));
vi.mock('../../services/geminiService', () => ({ generateEmail: mocks.generate }));
vi.mock('../../components/Toast', () => ({
  useToast: () => ({ warning: mocks.warning, info: vi.fn() }),
}));
vi.mock('../../components/ShareModal', () => ({ default: () => null }));
vi.mock('../../components/DocumentViewer', () => ({ default: () => null }));
vi.mock('../../components/InsuranceDirectory', () => ({ default: () => null }));
vi.mock('../../contexts/DivisionContext', () => ({
  useDivision: () => ({ division: mocks.division }),
}));
vi.mock('../../agnes21/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'fixture' } }),
  AgnesAuthProvider: ({ children }: any) => children,
}));
vi.mock('../../agnes21/components/PitchTrainer', () => ({
  default: ({ config }: any) => <p>Training script: {config.script}</p>,
}));
vi.mock('../../agnes21/utils/sessionStorage', () => ({
  getSessions: () => [],
  getSessionStats: () => ({}),
}));
vi.mock('../../services/roofService', () => ({ roofService: {} }));
vi.mock('../../agnes21/utils/phoneScripts', () => ({
  getScriptsByDivision: (division: string) => [
    {
      id: division,
      title: `${division} pitch`,
      category: 'door-to-door',
      division,
      content: `${division} fixture script`,
    },
  ],
}));
vi.mock('../../services/databaseService', () => ({
  databaseService: { logEmailGeneration: mocks.log },
}));
vi.mock('../../services/susanContextService', () => ({
  buildSusanContext: async () => '',
  excludeContextBlocks: () => '',
}));
vi.mock('../../services/knowledgeService', () => ({
  knowledgeService: {
    getDocumentsByDivision: mocks.docs,
    getCategories: async () => ['Scripts', 'Warranties'],
    loadDocument: async () => ({ content: 'Fixture template' }),
    searchDocuments: async () => [],
  },
}));
vi.mock('../../services/knowledgeEnhancedService', () => ({
  enhancedKnowledgeService: {
    getFavorites: () => [],
    getGoTo: () => [],
    searchDocuments: mocks.search,
    getRecentDocuments: async () => [],
    getFavoriteDocuments: async () => [],
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.division = 'insurance';
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    clear: () => data.clear(),
    removeItem: (key: string) => data.delete(key),
  });
  localStorage.clear();
  mocks.log.mockResolvedValue(undefined);
  mocks.generate.mockReset();
  mocks.docs.mockResolvedValue([
    { name: 'VA Pitch', path: '/VA/pitch.md', type: 'md', category: 'Scripts' },
    { name: 'MD Warranty', path: '/MD/warranty.md', type: 'md', category: 'Warranties' },
  ]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function generate() {
  fireEvent.change(screen.getByLabelText('Recipient name'), {
    target: { value: 'Fixture Homeowner' },
  });
  fireEvent.change(screen.getByLabelText('Subject line'), {
    target: { value: 'Inspection follow-up' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate Email with Susan AI' }));
}

it('keeps and saves the email when optional explanation fails', async () => {
  mocks.generate
    .mockResolvedValueOnce('Thank you for your time today.')
    .mockRejectedValueOnce(new Error('offline'));
  render(<EmailPanel />);
  generate();
  await screen.findByText('The explanation is unavailable. Your email draft is ready to review.');
  expect(screen.getByText('Thank you for your time today.')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('saved_emails')!)[0].body).toBe(
    'Thank you for your time today.',
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('preserves the previous draft on a failed regeneration', async () => {
  mocks.generate.mockResolvedValueOnce('Original draft.').mockResolvedValueOnce('Explanation.');
  render(<EmailPanel />);
  generate();
  await screen.findByText('Explanation.');
  mocks.generate.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Generate Email with Susan AI' }));
  await screen.findByRole('alert');
  expect(screen.getByText('Original draft.')).toBeInTheDocument();
  expect(screen.getByLabelText('Recipient name')).toHaveValue('Fixture Homeowner');
});

it('keeps generated content if local history storage is full', async () => {
  mocks.generate.mockResolvedValueOnce('Recoverable draft.').mockResolvedValueOnce('Explanation.');
  vi.mocked(localStorage.setItem).mockImplementation(() => {
    throw new Error('Quota exceeded');
  });
  render(<EmailPanel />);
  generate();
  await screen.findByText('Explanation.');
  expect(screen.getByText('Recoverable draft.')).toBeInTheDocument();
  expect(mocks.warning).toHaveBeenCalled();
});

it('copies the edited text after leaving edit mode', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  mocks.generate.mockResolvedValueOnce('Original draft.').mockResolvedValueOnce('Explanation.');
  render(<EmailPanel />);
  generate();
  await screen.findByText('Explanation.');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Email draft'), { target: { value: 'My edited draft.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('My edited draft.'));
});

it('applies a knowledge category on the first click and scopes search to it', async () => {
  mocks.search.mockResolvedValue([]);
  render(<KnowledgePanel />);
  await screen.findByText('VA Pitch');
  fireEvent.click(screen.getByRole('button', { name: 'Warranties' }));
  await waitFor(() => expect(screen.queryByText('VA Pitch')).not.toBeInTheDocument());
  expect(screen.getByText('MD Warranty')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search knowledge documents'), {
    target: { value: 'warranty' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() =>
    expect(mocks.search).toHaveBeenCalledWith(
      'warranty',
      expect.objectContaining({
        documents: [expect.objectContaining({ name: 'MD Warranty' })],
      }),
    ),
  );
});

it('shows a recoverable document loading failure', async () => {
  mocks.docs.mockRejectedValue(new Error('offline'));
  render(<KnowledgePanel />);
  await screen.findByRole('alert');
  mocks.docs.mockResolvedValue([{ name: 'Recovered document', path: '/recovered.md', type: 'md' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Recovered document');
});

it('switches Agnes to a script from the newly selected division', async () => {
  const { rerender } = render(<AgnesLearningPanel />);
  expect(screen.getByLabelText('Script content')).toHaveValue('insurance fixture script');
  mocks.division = 'retail';
  rerender(<AgnesLearningPanel />);
  await waitFor(() =>
    expect(screen.getByLabelText('Script content')).toHaveValue('retail fixture script'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start Session' }));
  expect(screen.getByText('Training script: retail fixture script')).toBeInTheDocument();
});

it('passes the custom Agnes script into the training session', () => {
  render(<AgnesLearningPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Use Custom Script' }));
  fireEvent.change(screen.getByLabelText('Script content'), {
    target: { value: 'My fictional practice script.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start Session' }));
  expect(screen.getByText('Training script: My fictional practice script.')).toBeInTheDocument();
});
