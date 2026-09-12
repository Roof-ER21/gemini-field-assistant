import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HomePage from '../../components/HomePageRedesigned';
import MobileFieldNav from '../../components/MobileFieldNav';
import ConnectionStatus from '../../components/ConnectionStatus';
import FieldSusanWelcome from '../../components/FieldSusanWelcome';
import Sidebar from '../../components/Sidebar';

const settings = vi.hoisted(() => ({ enabled: true, role: 'sales_rep' }));
vi.mock('../../services/messagingService', () => ({
  messagingService: {
    getUnreadCount: async () => ({ total_unread: 0 }),
    connect: () => {},
    onNewMessage: () => () => {},
  },
}));
vi.mock('../../contexts/DivisionContext', () => ({ useDivision: () => ({ isRetail: false }) }));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ isFeatureEnabled: () => settings.enabled }),
}));
vi.mock('../../services/authService', () => ({
  authService: { getCurrentUser: () => ({ name: 'Field Rep', role: settings.role, state: 'VA' }) },
}));

function fixtures(summary: unknown = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('summaries')
          ? summary
          : url.includes('weather.gov')
            ? { properties: { temperature: { value: null } } }
            : url.includes('storm-summary')
              ? { count: 4, maxMagnitude: null }
              : [],
    })),
  );
}
beforeEach(() => {
  settings.enabled = true;
  settings.role = 'sales_rep';
  fixtures();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('field home', () => {
  it('opens real tools from the primary actions', async () => {
    const navigate = vi.fn();
    render(<HomePage setActivePanel={navigate} userEmail="fixture@example.test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Susan' }));
    expect(navigate).toHaveBeenCalledWith('chat');
    fireEvent.click(screen.getByRole('button', { name: 'Analyze a document' }));
    expect(navigate).toHaveBeenCalledWith('image');
    fireEvent.click(screen.getByRole('button', { name: /Share your profile/ }));
    expect(navigate).toHaveBeenCalledWith('myprofile');
    await screen.findByText(/Temperature unavailable/);
    expect(screen.queryByText('0°F')).not.toBeInTheDocument();
  });
  it('keeps admin storm navigation out of a rep home', async () => {
    render(<HomePage setActivePanel={vi.fn()} userEmail="fixture@example.test" />);
    await screen.findByText(/Temperature unavailable/);
    expect(screen.queryByRole('button', { name: /Open Storm Maps/ })).not.toBeInTheDocument();
  });
  it('honors the Susan feature flag', async () => {
    settings.enabled = false;
    render(<HomePage setActivePanel={vi.fn()} userEmail="fixture@example.test" />);
    await screen.findByText(/Temperature unavailable/);
    expect(screen.queryByRole('button', { name: 'Ask Susan' })).not.toBeInTheDocument();
  });
  it('shows suggested follow-ups without asserting completion state', async () => {
    fixtures([
      {
        summary: 'Discussed inspection evidence.',
        topics: 'null',
        action_items: '["Check the photos"]',
      },
    ]);
    render(<HomePage setActivePanel={vi.fn()} userEmail="fixture@example.test" />);
    expect(await screen.findByText('Suggested follow-up: Check the photos')).toBeInTheDocument();
  });
  it('tolerates malformed nullable summary arrays', async () => {
    fixtures([{ summary: 'Saved conversation', topics: '{}', action_items: '42' }]);
    render(<HomePage setActivePanel={vi.fn()} userEmail="fixture@example.test" />);
    expect(await screen.findByText('Saved conversation')).toBeInTheDocument();
  });
  it('offers a working retry after a failed request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    render(<HomePage setActivePanel={vi.fn()} userEmail="fixture@example.test" />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fixtures([{ summary: 'Recovered conversation', topics: [], action_items: [] }]);
    fireEvent.click(retry);
    expect(await screen.findByText('Recovered conversation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('mobile navigation', () => {
  it('provides editable starting points without making requests', () => {
    const choose = vi.fn();
    render(<FieldSusanWelcome onChoose={choose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan an inspection' }));
    expect(choose).toHaveBeenCalledWith('Help me prepare a roof inspection photo checklist.');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses keyboard-operable sidebar controls and hides collapsed items', async () => {
    const navigate = vi.fn();
    render(<Sidebar activePanel="home" setActivePanel={navigate} />);
    const home = screen.getByRole('button', { name: 'Home Dashboard' });
    expect(home).toHaveAttribute('aria-current', 'page');
    fireEvent.click(home);
    expect(navigate).toHaveBeenCalledWith('home');
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    expect(screen.queryByRole('button', { name: /Knowledge Base/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Learn' })).toHaveAttribute('aria-expanded', 'false');
    await act(async () => {});
  });
  it('announces the active destination and opens More', () => {
    const onMenu = vi.fn(),
      onNavigate = vi.fn();
    render(
      <MobileFieldNav
        activePanel="home"
        menuOpen={false}
        onNavigate={onNavigate}
        onMenu={onMenu}
      />,
    );
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(onNavigate).toHaveBeenCalledWith('translator');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onMenu).toHaveBeenCalledOnce();
  });
  it('does not expose a disabled Susan destination', () => {
    settings.enabled = false;
    render(<MobileFieldNav activePanel="home" menuOpen onNavigate={vi.fn()} onMenu={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Susan' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
});

it('announces offline state and clears on reconnect without promising queued sends', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  render(<ConnectionStatus />);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('offline')));
  expect(screen.getByRole('status')).toHaveTextContent('Sending and AI tools need a connection.');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
  vi.restoreAllMocks();
});
