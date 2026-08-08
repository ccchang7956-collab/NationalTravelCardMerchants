import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FilterSheet, { DEFAULT_FILTER_STATE } from '../components/FilterSheet';

describe('FilterSheet', () => {
  const mockProps = {
    filters: DEFAULT_FILTER_STATE,
    cities: ['台北市', '新北市'],
    onChange: jest.fn(),
    userLocation: null,
    onRequestLocation: jest.fn(),
    locationLoading: false,
    locationError: null,
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    ) as jest.Mock;
  });

  it('renders trigger button correctly', () => {
    render(<FilterSheet {...mockProps} />);
    expect(screen.getByRole('button', { name: /篩選/i })).toBeInTheDocument();
  });

  it('opens modal dialog on trigger button click', async () => {
    render(<FilterSheet {...mockProps} />);
    const triggerBtn = screen.getByRole('button', { name: /篩選/i });

    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('篩選條件')).toBeInTheDocument();
    expect(screen.getByLabelText('縣市')).toBeInTheDocument();
  });
});
