// 瀏覽器定位錯誤中文訊息（GeolocationPositionError.code 分支）。
// map 頁、HomeSearchSection、RadarSheet 共用，避免 err.message 英文外洩。
export function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "定位權限被拒絕，請在瀏覽器設定中允許位置存取，或手動點擊地圖選擇位置";
    case err.POSITION_UNAVAILABLE:
      return "無法取得目前位置，請檢查定位服務後重試，或手動點擊地圖選擇位置";
    case err.TIMEOUT:
      return "定位逾時，請重試或手動點擊地圖選擇位置";
    default:
      return "定位失敗，請重試或手動點擊地圖選擇位置";
  }
}
