/**
 * Test Suite: AdminAnalyticsTab
 * Testing analytics dashboard UI, data flow, accessibility, and user interactions
 *
 * Prerequisites:
 * - npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom
 * - Create vitest.config.ts (see instructions below)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminAnalyticsTab from '../components/AdminAnalyticsTab';

// ============================================================================
// MOCKS
// ============================================================================

// Mock fetch globally
global.fetch = vi.fn();

// Mock URL methods for CSV export
global.URL.createObjectURL = vi.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document methods for CSV download
const mockLink = {
  href: '',
  download: '',
  click: vi.fn(),
  style: {},
};

// ============================================================================
// TEST DATA
// ============================================================================

const mockOverviewStats = {
  totalUsers: 42,
  activeUsers7d: 28,
  totalMessages: 1524,
  totalConversations: 389,
  emailsGenerated: 156,
  transcriptions: 89,
  documentsUploaded: 234,
  susanSessions: 67,
};

const mockUserActivity = [
  {
    email: 'john.doe@roofer.com',
    role: 'sales_rep',
    state: 'MD',
    chats: 45,
    emails: 23,
    transcriptions: 12,
    uploads: 8,
    susan: 15,
    kbViews: 67,
    lastActive: '2025-01-05T10:00:00Z',
  },
  {
    email: 'jane.smith@roofer.com',
    role: 'manager',
    state: 'VA',
    chats: 38,
    emails: 19,
    transcriptions: 7,
    uploads: 5,
    susan: 11,
    kbViews: 52,
    lastActive: '2025-01-04T15:30:00Z',
  },
  {
    email: 'bob.jones@roofer.com',
    role: 'sales_rep',
    state: null, // Test null state
    chats: 20,
    emails: 10,
    transcriptions: 3,
    uploads: 2,
    susan: 5,
    kbViews: 25,
    lastActive: '2025-01-03T09:15:00Z',
  },
];

const mockFeatureUsage = [
  {
    date: '2025-01-01',
    chat: 45,
    email: 23,
    upload: 12,
    transcribe: 8,
    susan: 15,
    knowledgeBase: 34,
  },
  {
    date: '2025-01-02',
    chat: 52,
    email: 28,
    upload: 15,
    transcribe: 10,
    susan: 18,
    knowledgeBase: 40,
  },
];

const mockKnowledgeBase = {
  mostViewed: [
    { name: 'Product Catalog 2024', views: 234, category: 'Products' },
    { name: 'Installation Guide', views: 189, category: 'Technical' },
  ],
  mostFavorited: [
    { name: 'Quick Reference Guide', favorites: 45, category: 'Reference' },
    { name: 'Email Templates', favorites: 38, category: 'Sales' },
  ],
  topCategories: [
    { category: 'Products', count: 456 },
    { category: 'Sales', count: 389 },
  ],
};

const mockConcerningChats = [
  {
    id: '1',
    userEmail: 'user1@example.com',
    severity: 'critical' as const,
    concernType: 'Pricing Complaint',
    content: 'Customer mentioned our prices are too high compared to competitors...',
    fullContext: 'User: Your prices seem really high.\nAI: Let me help you understand our pricing...',
    timestamp: '2025-01-05T12:00:00Z',
  },
  {
    id: '2',
    userEmail: 'user2@example.com',
    severity: 'warning' as const,
    concernType: 'Product Question',
    content: 'User asking about discontinued product...',
    fullContext: 'User: Do you still carry Model X?\nAI: Let me check our current inventory...',
    timestamp: '2025-01-05T14:30:00Z',
  },
  {
    id: '3',
    userEmail: 'user3@example.com',
    severity: 'info' as const,
    concernType: 'General Inquiry',
    content: 'User asking about business hours...',
    fullContext: 'User: What are your hours?\nAI: We are open Monday through Friday...',
    timestamp: '2025-01-05T16:00:00Z',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const mockFetchResponses = (responses: Record<string, any>) => {
  (global.fetch as any).mockImplementation((url: string) => {
    if (url.includes('/overview')) {
      return Promise.resolve({
        ok: true,
        json: async () => responses.overview || mockOverviewStats,
      });
    }
    if (url.includes('/user-activity')) {
      return Promise.resolve({
        ok: true,
        json: async () => responses.userActivity || mockUserActivity,
      });
    }
    if (url.includes('/feature-usage')) {
      return Promise.resolve({
        ok: true,
        json: async () => responses.featureUsage || mockFeatureUsage,
      });
    }
    if (url.includes('/knowledge-base')) {
      return Promise.resolve({
        ok: true,
        json: async () => responses.knowledgeBase || mockKnowledgeBase,
      });
    }
    if (url.includes('/concerning-chats')) {
      return Promise.resolve({
        ok: true,
        json: async () => responses.concerningChats || mockConcerningChats,
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe('AdminAnalyticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchResponses({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. COMPONENT RENDERING
  // ==========================================================================

  describe('Component Rendering', () => {
    it('should render time range filter buttons', () => {
      render(<AdminAnalyticsTab />);

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('This Week')).toBeInTheDocument();
      expect(screen.getByText('This Month')).toBeInTheDocument();
      expect(screen.getByText('All Time')).toBeInTheDocument();
    });

    it('should have "This Week" selected by default', () => {
      render(<AdminAnalyticsTab />);

      const weekButton = screen.getByText('This Week');
      expect(weekButton).toHaveStyle({ background: '#ef4444' });
    });

    it('should show loading state initially', async () => {
      render(<AdminAnalyticsTab />);

      // Should show loading skeletons
      const loadingElements = document.querySelectorAll('[style*="animation"]');
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    it('should render all stat cards after loading', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument(); // totalUsers
      });

      expect(screen.getByText('Total Users')).toBeInTheDocument();
      expect(screen.getByText('Active Users (7d)')).toBeInTheDocument();
      expect(screen.getByText('Total Messages')).toBeInTheDocument();
      expect(screen.getByText('Conversations')).toBeInTheDocument();
      expect(screen.getByText('Emails Generated')).toBeInTheDocument();
      expect(screen.getByText('Transcriptions')).toBeInTheDocument();
      expect(screen.getByText('Documents Uploaded')).toBeInTheDocument();
      expect(screen.getByText('Susan Sessions')).toBeInTheDocument();
    });

    it('should render section titles', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Feature Usage Over Time')).toBeInTheDocument();
      });

      expect(screen.getByText('Top Active Users')).toBeInTheDocument();
      expect(screen.getByText('Concerning Chats Monitor')).toBeInTheDocument();
      expect(screen.getByText('User Activity Breakdown')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 2. DATA FETCHING
  // ==========================================================================

  describe('Data Fetching', () => {
    it('should fetch all analytics endpoints on mount', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/analytics/overview?range=week')
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/analytics/user-activity?range=week')
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/analytics/feature-usage?range=week')
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/analytics/knowledge-base?range=week')
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/analytics/concerning-chats?range=week')
        );
      });
    });

    it('should display fetched data correctly', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
        expect(screen.getByText('john.doe@roofer.com')).toBeInTheDocument();
      });
    });

    it('should handle 403 forbidden error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<AdminAnalyticsTab />);

      // Component should fall back to mock data (current behavior)
      // In production, should show error message
      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should handle network error gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Failed to fetch'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<AdminAnalyticsTab />);

      // Should not crash
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should handle empty data arrays', async () => {
      mockFetchResponses({
        userActivity: [],
        concerningChats: [],
      });

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('No Concerning Chats')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 3. TIME RANGE FILTERING
  // ==========================================================================

  describe('Time Range Filtering', () => {
    it('should refetch data when time range changes to "today"', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
      });

      const todayButton = screen.getByText('Today');
      fireEvent.click(todayButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('range=today')
        );
      });
    });

    it('should update button active state', () => {
      render(<AdminAnalyticsTab />);

      const monthButton = screen.getByText('This Month');
      fireEvent.click(monthButton);

      expect(monthButton).toHaveStyle({ background: '#ef4444' });
    });

    it('should fetch with correct range for all time periods', async () => {
      render(<AdminAnalyticsTab />);

      const ranges = [
        { label: 'Today', value: 'today' },
        { label: 'This Week', value: 'week' },
        { label: 'This Month', value: 'month' },
        { label: 'All Time', value: 'all' },
      ];

      for (const { label, value } of ranges) {
        const button = screen.getByText(label);
        fireEvent.click(button);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(`range=${value}`)
          );
        });
      }
    });
  });

  // ==========================================================================
  // 4. TABLE SORTING
  // ==========================================================================

  describe('Table Sorting', () => {
    it('should sort by chats column descending by default', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('john.doe@roofer.com')).toBeInTheDocument();
      });

      const chatsHeader = screen.getByText('Chats');
      fireEvent.click(chatsHeader);

      // Get table rows
      const rows = screen.getAllByRole('row');
      const row1Text = rows[1].textContent || '';
      const row2Text = rows[2].textContent || '';

      // John (45 chats) should be before Jane (38 chats)
      expect(row1Text).toContain('john.doe@roofer.com');
      expect(row2Text).toContain('jane.smith@roofer.com');
    });

    it('should toggle sort direction on second click', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('john.doe@roofer.com')).toBeInTheDocument();
      });

      const chatsHeader = screen.getByText('Chats');

      // First click - descending
      fireEvent.click(chatsHeader);
      let rows = screen.getAllByRole('row');
      expect(rows[1].textContent).toContain('john.doe@roofer.com');

      // Second click - ascending
      fireEvent.click(chatsHeader);
      rows = screen.getAllByRole('row');
      expect(rows[1].textContent).toContain('bob.jones@roofer.com');
    });

    it('should display sort direction indicator', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('john.doe@roofer.com')).toBeInTheDocument();
      });

      const emailHeader = screen.getByText('Email');
      fireEvent.click(emailHeader);

      // Should show arrow indicator
      expect(emailHeader.textContent).toContain('↓');
    });

    it('should handle sorting with null values', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('bob.jones@roofer.com')).toBeInTheDocument();
      });

      const stateHeader = screen.getByText('State');
      fireEvent.click(stateHeader);

      // Should not crash
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(0);
    });

    it('should sort dates correctly', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('john.doe@roofer.com')).toBeInTheDocument();
      });

      const lastActiveHeader = screen.getByText('Last Active');
      fireEvent.click(lastActiveHeader);

      const rows = screen.getAllByRole('row');
      // Most recent (John - Jan 5) should be first
      expect(rows[1].textContent).toContain('john.doe@roofer.com');
    });
  });

  // ==========================================================================
  // 5. PAGINATION
  // ==========================================================================

  describe('Pagination', () => {
    it('should display pagination when more than 20 users', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        email: `user${i}@test.com`,
        role: 'sales_rep',
        state: 'MD',
        chats: i,
        emails: i,
        transcriptions: i,
        uploads: i,
        susan: i,
        kbViews: i,
        lastActive: new Date().toISOString(),
      }));

      mockFetchResponses({ userActivity: manyUsers });

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });

      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('should navigate to next page', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        email: `user${i}@test.com`,
        role: 'sales_rep',
        state: 'MD',
        chats: i,
        emails: i,
        transcriptions: i,
        uploads: i,
        susan: i,
        kbViews: i,
        lastActive: new Date().toISOString(),
      }));

      mockFetchResponses({ userActivity: manyUsers });

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('user0@test.com')).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
        expect(screen.getByText('user20@test.com')).toBeInTheDocument();
        expect(screen.queryByText('user0@test.com')).not.toBeInTheDocument();
      });
    });

    it('should disable previous button on first page', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        email: `user${i}@test.com`,
        role: 'sales_rep',
        state: 'MD',
        chats: i,
        emails: i,
        transcriptions: i,
        uploads: i,
        susan: i,
        kbViews: i,
        lastActive: new Date().toISOString(),
      }));

      mockFetchResponses({ userActivity: manyUsers });

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        const prevButton = screen.getByText('Previous');
        expect(prevButton).toBeDisabled();
      });
    });

    it('should disable next button on last page', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        email: `user${i}@test.com`,
        role: 'sales_rep',
        state: 'MD',
        chats: i,
        emails: i,
        transcriptions: i,
        uploads: i,
        susan: i,
        kbViews: i,
        lastActive: new Date().toISOString(),
      }));

      mockFetchResponses({ userActivity: manyUsers });

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        const nextButton = screen.getByText('Next');
        fireEvent.click(nextButton);
      });

      await waitFor(() => {
        const nextButton = screen.getByText('Next');
        expect(nextButton).toBeDisabled();
      });
    });
  });

  // ==========================================================================
  // 6. SEVERITY FILTERING
  // ==========================================================================

  describe('Severity Filtering', () => {
    it('should display all severity filter buttons', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('critical')).toBeInTheDocument();
      });

      expect(screen.getByText('warning')).toBeInTheDocument();
      expect(screen.getByText('info')).toBeInTheDocument();
      expect(screen.getByText('all')).toBeInTheDocument();
    });

    it('should filter chats by critical severity', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });

      const criticalButton = screen.getByText('critical');
      fireEvent.click(criticalButton);

      // Should only show critical chat
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      expect(screen.queryByText('user2@example.com')).not.toBeInTheDocument();
      expect(screen.queryByText('user3@example.com')).not.toBeInTheDocument();
    });

    it('should show empty state when filter has no results', async () => {
      mockFetchResponses({ concerningChats: [] });

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('No Concerning Chats')).toBeInTheDocument();
      });

      expect(screen.getByText('All conversations are within normal parameters')).toBeInTheDocument();
    });

    it('should reset filter when "all" is clicked', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      });

      // Filter to critical
      const criticalButton = screen.getByText('critical');
      fireEvent.click(criticalButton);

      // Reset to all
      const allButton = screen.getByText('all');
      fireEvent.click(allButton);

      // Should show all chats again
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      expect(screen.getByText('user2@example.com')).toBeInTheDocument();
      expect(screen.getByText('user3@example.com')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 7. EXPANDABLE CHATS
  // ==========================================================================

  describe('Expandable Chats', () => {
    it('should expand chat on click', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Pricing Complaint')).toBeInTheDocument();
      });

      const chatElement = screen.getByText('Pricing Complaint').closest('div');
      if (chatElement) {
        fireEvent.click(chatElement);
      }

      await waitFor(() => {
        expect(screen.getByText(/User: Your prices seem really high/)).toBeInTheDocument();
      });
    });

    it('should collapse chat on second click', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Pricing Complaint')).toBeInTheDocument();
      });

      const chatElement = screen.getByText('Pricing Complaint').closest('div');
      if (chatElement) {
        fireEvent.click(chatElement);
        await waitFor(() => {
          expect(screen.getByText(/User: Your prices seem really high/)).toBeInTheDocument();
        });

        fireEvent.click(chatElement);
        await waitFor(() => {
          expect(screen.queryByText(/User: Your prices seem really high/)).not.toBeInTheDocument();
        });
      }
    });

    it('should show correct severity icon', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        const criticalEmoji = screen.getByText('🔴');
        const warningEmoji = screen.getByText('🟡');
        const infoEmoji = screen.getByText('🔵');

        expect(criticalEmoji).toBeInTheDocument();
        expect(warningEmoji).toBeInTheDocument();
        expect(infoEmoji).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 8. CSV EXPORT
  // ==========================================================================

  describe('CSV Export', () => {
    beforeEach(() => {
      vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'a') {
          return mockLink as any;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
    });

    it('should trigger CSV download', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export CSV');
      fireEvent.click(exportButton);

      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toContain('.csv');
    });

    it('should include correct headers in CSV', async () => {
      let blobContent = '';
      const originalBlob = global.Blob;

      global.Blob = class MockBlob {
        constructor(content: any[]) {
          blobContent = content[0];
        }
      } as any;

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export CSV');
      fireEvent.click(exportButton);

      expect(blobContent).toContain('Email,Role,State,Chats,Emails,Transcriptions,Uploads,Susan,KB Views,Last Active');

      global.Blob = originalBlob;
    });

    it('should include user data in CSV', async () => {
      let blobContent = '';
      const originalBlob = global.Blob;

      global.Blob = class MockBlob {
        constructor(content: any[]) {
          blobContent = content[0];
        }
      } as any;

      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('john.doe@roofer.com')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export CSV');
      fireEvent.click(exportButton);

      expect(blobContent).toContain('john.doe@roofer.com');
      expect(blobContent).toContain('jane.smith@roofer.com');

      global.Blob = originalBlob;
    });
  });

  // ==========================================================================
  // 9. ACCESSIBILITY
  // ==========================================================================

  describe('Accessibility', () => {
    it('should have proper button roles', () => {
      render(<AdminAnalyticsTab />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should have table structure', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
      });
    });

    it('should have column headers', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('Role')).toBeInTheDocument();
        expect(screen.getByText('Chats')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 10. KNOWLEDGE BASE SECTION
  // ==========================================================================

  describe('Knowledge Base Analytics', () => {
    it('should display most viewed documents', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Product Catalog 2024')).toBeInTheDocument();
        expect(screen.getByText('Installation Guide')).toBeInTheDocument();
      });
    });

    it('should display most favorited documents', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Quick Reference Guide')).toBeInTheDocument();
        expect(screen.getByText('Email Templates')).toBeInTheDocument();
      });
    });

    it('should display top categories', async () => {
      render(<AdminAnalyticsTab />);

      await waitFor(() => {
        expect(screen.getByText('Products')).toBeInTheDocument();
        expect(screen.getByText('Sales')).toBeInTheDocument();
      });
    });
  });
});

// ============================================================================
// SETUP INSTRUCTIONS
// ============================================================================

/*
To run these tests:

1. Install dependencies:
   npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom

2. Create vitest.config.ts:
   import { defineConfig } from 'vitest/config';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'jsdom',
       globals: true,
       setupFiles: './tests/setup.ts',
     },
   });

3. Create tests/setup.ts:
   import '@testing-library/jest-dom';

4. Add test script to package.json:
   "scripts": {
     "test": "vitest",
     "test:ui": "vitest --ui",
     "test:coverage": "vitest --coverage"
   }

5. Run tests:
   npm test
*/
