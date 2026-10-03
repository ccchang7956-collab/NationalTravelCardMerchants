export interface IndustryDetail {
  code: string;
  name: string;
}

export interface IndustryGroup {
  code: string;
  name: string;
  details: IndustryDetail[];
}

// Codes and labels mirror the two-level selectors on the official NCCC inquiry page.
export const INDUSTRY_GROUPS: IndustryGroup[] = [
  {
    code: "0017",
    name: "旅行業",
    details: [
      { code: "7901", name: "旅行社-觀光旅遊" },
      { code: "7900", name: "旅行社" },
    ],
  },
  {
    code: "0009",
    name: "旅宿業",
    details: [
      { code: "5591", name: "民宿業" },
      { code: "5590", name: "其他住宿服務業" },
      { code: "5512", name: "郵購、網購-旅館" },
      { code: "5511", name: "一般旅館業" },
      { code: "5510", name: "觀光旅館業" },
    ],
  },
  {
    code: "0007",
    name: "交通運輸業",
    details: [
      { code: "9811", name: "政府機關" },
      { code: "7721", name: "汽車租賃業" },
      { code: "5291", name: "郵購、網購-交通運輸業" },
      { code: "5290", name: "其他運輸輔助業" },
      { code: "5241", name: "停車場業" },
      { code: "5101", name: "民用航空運輸業" },
      { code: "5010", name: "海洋水運業" },
      { code: "4939", name: "一般汽車客運業" },
      { code: "4932", name: "計程車" },
      { code: "4910", name: "鐵路運輸業" },
    ],
  },
  {
    code: "0018",
    name: "觀光遊樂業",
    details: [
      { code: "9329", name: "其他觀光遊樂業" },
      { code: "9321", name: "遊樂園業" },
      { code: "9102", name: "生態教育農園" },
      { code: "0210", name: "森林遊樂業" },
      { code: "0119", name: "休閒農場(園)" },
      { code: "0115", name: "觀光果茶(園)" },
    ],
  },
  {
    code: "0008",
    name: "其他業別-餐飲",
    details: [
      { code: "5621", name: "飲料店業" },
      { code: "5610", name: "餐館業" },
    ],
  },
  {
    code: "0020",
    name: "其他業別-農特產及手工藝品",
    details: [
      { code: "4728", name: "其他農畜水產品零售業" },
      { code: "1309", name: "其他木製品製造業" },
      { code: "0139", name: "其他農事服務業" },
    ],
  },
  {
    code: "0021",
    name: "其他業別-加油站",
    details: [{ code: "4821", name: "加油站業" }],
  },
  {
    code: "0015",
    name: "其他業別-體育用品",
    details: [
      { code: "9599", name: "自行車專賣店" },
      { code: "4763", name: "運動用品器材零售業" },
      { code: "4762", name: "體育用品業" },
    ],
  },
  {
    code: "0016",
    name: "其他業別-其他服務",
    details: [
      { code: "9511", name: "未分類其他服務業" },
      { code: "9312", name: "運動場館" },
      { code: "8203", name: "身心障礙者福利服務業" },
      { code: "4850", name: "未分類其他零售業" },
      { code: "4749", name: "攝影器材及沖洗專賣店" },
    ],
  },
  {
    code: "0025",
    name: "其他業別-服飾",
    details: [{ code: "4732", name: "成衣零售業" }],
  },
  {
    code: "0026",
    name: "其他業別-皮鞋皮件",
    details: [
      { code: "4739", name: "服飾配件零售業" },
      { code: "4733", name: "皮鞋皮件業" },
    ],
  },
  {
    code: "0027",
    name: "其他業別-美容護膚",
    details: [
      { code: "9620", name: "美容護膚業" },
      { code: "4752", name: "化妝品零售業" },
    ],
  },
  {
    code: "0023",
    name: "其他業別-商圈及其他",
    details: [
      { code: "9690", name: "未分類其他個人服務業" },
      { code: "9331", name: "其它" },
      { code: "9330", name: "其他休閒服務業" },
      { code: "4852", name: "未分類其他零售業" },
      { code: "4819", name: "其他無店面零售業" },
      { code: "4729", name: "食品什貨零售業" },
      { code: "4711", name: "其他綜合商品零售業" },
    ],
  },
  {
    code: "0030",
    name: "其他業別-藝文圖書",
    details: [
      { code: "9324", name: "畫廊及藝廊" },
      { code: "9323", name: "美術館" },
      { code: "9103", name: "博物館" },
      { code: "9039", name: "郵購(網購)藝文展演" },
      { code: "9032", name: "舞蹈" },
      { code: "9031", name: "音樂會" },
      { code: "5914", name: "電影院" },
      { code: "5911", name: "戲劇" },
      { code: "4761", name: "書店" },
    ],
  },
  {
    code: "0031",
    name: "其他業別",
    details: [
      { code: "9692", name: "未分類其他服務業" },
      { code: "9691", name: "搬家業" },
      { code: "9610", name: "洗衣業" },
      { code: "9322", name: "視聽服務" },
      { code: "8700", name: "未分類其他醫院服務業" },
      { code: "8699", name: "國術館/接骨院" },
      { code: "8621", name: "中西醫" },
      { code: "8620", name: "牙科" },
      { code: "8610", name: "醫院" },
      { code: "8121", name: "清潔公司" },
      { code: "7500", name: "獸醫" },
      { code: "6209", name: "媒體.數位產品" },
      { code: "6109", name: "未分類其他資訊服務" },
      { code: "4871", name: "電子購物及郵購業" },
      { code: "4842", name: "機車零售業" },
      { code: "4841", name: "汽車零售業" },
      { code: "4833", name: "其他通訊器材" },
      { code: "4832", name: "電訊設備" },
      { code: "4831", name: "電腦設備" },
      { code: "4764", name: "影音類" },
      { code: "4753", name: "未分類其他醫療用品" },
      { code: "4751", name: "藥局/醫療器材" },
      { code: "4750", name: "其他電器類" },
      { code: "4745", name: "眼鏡行業" },
      { code: "4744", name: "鐘錶業" },
      { code: "4743", name: "地毯及裝潢" },
      { code: "4742", name: "家具店" },
      { code: "4741", name: "家電業" },
      { code: "4721", name: "免稅店" },
      { code: "4720", name: "五金行" },
      { code: "4719", name: "百貨商品/未分類百貨商品" },
      { code: "4713", name: "便利商店/食品零售業" },
      { code: "4712", name: "百貨公司" },
      { code: "4699", name: "超級市場" },
      { code: "4566", name: "珠寶及貴金屬製品批發零售業" },
    ],
  },
];
