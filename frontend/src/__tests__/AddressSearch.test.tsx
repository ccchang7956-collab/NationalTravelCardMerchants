import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
