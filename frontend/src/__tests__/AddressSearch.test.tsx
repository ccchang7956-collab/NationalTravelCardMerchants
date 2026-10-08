import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import AddressSearch from '../components/AddressSearch';

describe('AddressSearch', () => {
  it('renders input field with placeholder', () => {
    const handleSelect = jest.fn();
    render(<AddressSearch onSelect={handleSelect} />);
    
    const input = screen.getByPlaceholderText('輸入地址輔助定位...');
    expect(input).toBeInTheDocument();
  });

  it('updates query value on user typing', () => {
    const handleSelect = jest.fn();
    render(<AddressSearch onSelect={handleSelect} />);

    const input = screen.getByPlaceholderText('輸入地址輔助定位...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '台北101' } });
    expect(input.value).toBe('台北101');
  });

  it('clears query without errors when input is cleared', () => {
    const handleSelect = jest.fn();
    render(<AddressSearch onSelect={handleSelect} />);

    const input = screen.getByPlaceholderText('輸入地址輔助定位...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '台北101' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });

  it('only searches on submit and does not search again after selecting', async () => {
    jest.useFakeTimers();
    const handleSelect = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [
      { place_id: 1, lat: '25.03', lon: '121.56', display_name: '台北市信義路, 台灣' },
    ] });
    try {
      render(<AddressSearch onSelect={handleSelect} />);
      const input = screen.getByRole('textbox', { name: '地址搜尋' });
      fireEvent.change(input, { target: { value: '台北市信義路' } });
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(fetch).not.toHaveBeenCalled();
      fireEvent.submit(input.closest('form')!);
      await act(async () => {});
      expect(fetch).toHaveBeenCalledTimes(1);
      expect((fetch as jest.Mock).mock.calls[0][0]).toContain('/api/geocoding/search?q=');
      fireEvent.click(screen.getByRole('button', { name: '台北市信義路, 台灣' }));
      expect(handleSelect).toHaveBeenCalledWith(25.03, 121.56);
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: '台北市信義路, 台灣' })).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores an earlier response after the address was edited', async () => {
    let finish: (value: unknown) => void = () => {};
    global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AddressSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('textbox', { name: '地址搜尋' });
    fireEvent.change(input, { target: { value: '台北市' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: '高雄市' } });
    await act(async () => { finish({ ok: true, json: async () => [
      { place_id: 1, lat: '25', lon: '121', display_name: '舊的台北市結果' },
    ] }); });
    expect(screen.queryByText('舊的台北市結果')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '搜尋地址' })).toBeEnabled();
  });

  it('shows a retry message on the shared rate limit', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    render(<AddressSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('textbox', { name: '地址搜尋' });
    fireEvent.change(input, { target: { value: '台北市' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('地址搜尋忙碌中');
  });
});
