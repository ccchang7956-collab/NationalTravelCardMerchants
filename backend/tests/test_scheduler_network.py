import pytest
from unittest.mock import patch, MagicMock
import requests
import urllib3
import time
from scheduler.update_data import download_zip

@patch("requests.adapters.HTTPAdapter.send")
def test_download_zip_with_adapter_mock_fails(mock_send):
    """
    依照 Reviewer 建議，Mock `requests.adapters.HTTPAdapter.send` 並拋出 ConnectionError。
    此時因 Mock 阻斷了底層重試鏈，`adapter.send` 在一次 Session 調用中只會被呼叫 1 次。
    """
    mock_send.side_effect = requests.exceptions.ConnectionError("Connection aborted.")
    
    res = download_zip("dummy_dest.zip")
    
    assert res is False
    assert mock_send.call_count == 1


@patch("time.sleep", return_value=None)
@patch("urllib3.connectionpool.HTTPConnectionPool._make_request")
def test_download_zip_real_retry_chain(mock_make_request, mock_sleep):
    """
    真正驗證 urllib3 指數退避重試鏈的測試。
    藉由 Mock 最底層的 `_make_request` 拋出例外，使真實的 `urllib3.urlopen`
    能在不被 Mock 阻斷的情況下完整執行自動重試邏輯（total=5）。
    """
    mock_make_request.side_effect = urllib3.exceptions.ProtocolError("Connection refused")
    
    res = download_zip("dummy_dest.zip")
    
    assert res is False
    # 1 次初始請求 + 5 次重試 = 6 次呼叫
    assert mock_make_request.call_count == 6
    # 驗證退避重試期間有進行 sleep
    assert mock_sleep.call_count == 4
