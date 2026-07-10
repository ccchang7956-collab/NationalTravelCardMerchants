import pytest
from unittest.mock import MagicMock, patch
from scheduler.update_data import download_zip

@patch("scheduler.update_data.requests.Session")
def test_download_zip_with_retry_failures_then_success(mock_session_cls):
    # 模擬 Session
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    
    # 建立幾次失敗的 Response，以及最後一次成功的 Response
    mock_fail_resp = MagicMock()
    mock_fail_resp.raise_for_status.side_effect = Exception("503 Service Unavailable")
    
    mock_success_resp = MagicMock()
    mock_success_resp.raise_for_status.return_value = None
    mock_success_resp.iter_content.return_value = [b"zip-data"]
    
    # 模擬前兩次失敗，第三次成功（共3次呼叫）
    mock_session.get.side_effect = [
        mock_fail_resp, 
        mock_fail_resp, 
        mock_success_resp
    ]
    
    with patch("builtins.open", MagicMock()):
        with patch("os.path.getsize", return_value=1024):
            res = download_zip("dummy_dest.zip")
            
    assert res is True
    # 驗證總共呼叫了 3 次 get
    assert mock_session.get.call_count == 3
