import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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

  it('renders trigger button correctly', async () => {
    render(<FilterSheet {...mockProps} />);
    expect(screen.getByRole('button', { name: /篩選/i })).toBeInTheDocument();
    await screen.findByText('行業資料尚未同步，分類更新後即可使用。');
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
    await screen.findByText('行業資料尚未同步，分類更新後即可使用。');
  });

  it('applies a selected official industry detail code', async () => {
    const onChange = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          industry_code: '551011',
          industry_name: '旅館業',
          industry_group_code: '55',
          industry_group_name: '住宿業',
          industry_group_order: 44,
        },
        {
          industry_code: '551013',
          industry_name: '民宿',
          industry_group_code: '55',
          industry_group_name: '住宿業',
          industry_group_order: 44,
        },
      ]),
    }) as jest.Mock;

    render(<FilterSheet {...mockProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /篩選/i }));

    await screen.findByRole('option', { name: '住宿業' });
    fireEvent.change(screen.getByLabelText('行業別'), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText('行業細項分類'), { target: { value: '551013' } });
    fireEvent.click(screen.getByRole('button', { name: /套用篩選/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ industryCode: '551013' }));
    });
  });
});
