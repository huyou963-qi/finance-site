/** 美国历史 14 个经济时代阶段（1776—今） */
export const US_HISTORY_ERAS = [
  {
    seedKey: "us-era-founding",
    tag: "建国宪政",
    title: "建国与宪政秩序",
    dateFrom: "1776-07-04",
    dateTo: "1815-12-31",
    cyclePhase: "混合",
    defaultExpanded: true,
    wikipediaUrl:
      "https://en.wikipedia.org/wiki/History_of_the_United_States_(1776%E2%80%931789)",
    eraSummary: `【阶段概览】
独立战争至1815年，美国从殖民地变为联邦共和国，建立汉密尔顿式国家信用与早期银行体系，在扩张与战争扰动中摸索财政—货币秩序。

【繁荣动力】
独立后领土与人口扩张；农业与海运出口；汉密尔顿三报告（国债、关税、第一银行）重建信用；1790年代商业复苏与纽约金融中心萌芽。

【萧条/危机成因】
独立战争恶性通胀与大陆券贬值；1797年恐慌与银行收缩；1807年禁运打击贸易；1812战争财政压力与1814年首都陷落。

【制度与结构】
宪法与权利法案；联邦与州权分权；第一/第二银行争议；金/银复本位争论；早期关税保护体系。

【Wikipedia 延伸阅读】
英文条目 History of the U.S. (1776–1789) 涵盖建国财政与宪政实验。`,
  },
  {
    seedKey: "us-era-market-revolution",
    tag: "市场革命",
    title: "市场革命与杰克逊民主",
    dateFrom: "1815-01-01",
    dateTo: "1860-12-31",
    cyclePhase: "繁荣",
    defaultExpanded: true,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Market_revolution",
    eraSummary: `【阶段概览】
1815—1860年「市场革命」：运河、铁路、工厂制与西部开发重塑美国经济地理，杰克逊时代民主与反银行民粹改变政治—金融关系。

【繁荣动力】
交通革命降低运费；工厂制与纺织业；1840s—50s铁路与电报投资潮；移民劳动力；棉花—制造业出口链。

【萧条/危机成因】
1819、1837、1857三次恐慌；杰克逊废除第二银行后「自由银行」碎片化；奴隶制与关税政治撕裂；1857全球商品价格下跌。

【制度与结构】
自由银行法；独立国库实验；电报与统一国内市场；关税（1828/1846）保护工业。

【Wikipedia 延伸阅读】
Market Revolution 条目系统阐述交通—工厂—金融联动。`,
  },
  {
    seedKey: "us-era-civil-war",
    tag: "内战重建",
    title: "内战与重建",
    dateFrom: "1861-04-12",
    dateTo: "1877-03-31",
    cyclePhase: "战争动员",
    defaultExpanded: true,
    wikipediaUrl: "https://en.wikipedia.org/wiki/American_Civil_War",
    eraSummary: `【阶段概览】
1861—1877年内战与重建：北方工业化与战争动员，南方毁灭性冲击，绿背货币与国民银行法重塑货币体系，1873恐慌开启镀金时代前奏。

【繁荣动力】
北方军工与铁路需求；宅地法与太平洋铁路法推动西部开发；战争技术扩散至民用产业。

【萧条/危机成因】
南方经济崩溃；绿背通胀与战后紧缩；重建失败与种族政治；1873年恐慌起点。

【制度与结构】
国家银行法；绿背与金本位恢复路径；宅地法；重建修正案与联邦权力扩张。

【Wikipedia 延伸阅读】
American Civil War 及 Reconstruction era 条目。`,
  },
  {
    seedKey: "us-era-gilded-age",
    tag: "镀金时代",
    title: "镀金时代与第二次工业革命",
    dateFrom: "1877-01-01",
    dateTo: "1893-06-30",
    cyclePhase: "繁荣",
    defaultExpanded: false,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Gilded_Age",
    eraSummary: `【阶段概览】
1877—1893年镀金时代：铁路网、钢铁石油电力巨头崛起，1879年金兑付恢复，1893大恐慌终结本阶段繁荣。

【繁荣动力】
横贯大陆铁路；贝塞默炼钢与石油精炼；电力与电话；移民劳动力；1879恢复金兑付稳定预期。

【萧条/危机成因】
垄断与政治腐败；劳工冲突（1877铁路大罢工）；1893大恐慌与1896白银辩论；过度铁路投资。

【制度与结构】
金本位恢复；谢尔曼反垄断法萌芽；州际商务委员会；移民潮改变劳动力供给。

【Wikipedia 延伸阅读】
Gilded Age 条目。`,
  },
  {
    seedKey: "us-era-progressive",
    tag: "进步主义",
    title: "进步主义与帝国扩张",
    dateFrom: "1893-07-01",
    dateTo: "1914-07-27",
    cyclePhase: "转型",
    defaultExpanded: false,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Progressive_Era",
    eraSummary: `【阶段概览】
1893—1914进步主义：企业整合与电气/汽车革命并行，1907恐慌推动联储成立，1913所得税与反垄断强化联邦监管。

【繁荣动力】
企业整合与规模经济；电气/汽车产业化；出口与金本位稳定期；巴拿马运河改善航运。

【萧条/危机成因】
1907银行恐慌；托拉斯反弹；缺乏最后贷款人直至1913；农业长期相对萧条。

【制度与结构】
联储成立；联邦所得税；FTC与反垄断诉讼；美西战争与海外扩张。

【Wikipedia 延伸阅读】
Progressive Era 条目。`,
  },
  {
    seedKey: "us-era-roaring-twenties",
    tag: "咆哮二十年代",
    title: "一战与咆哮的二十年代",
    dateFrom: "1914-07-28",
    dateTo: "1929-10-29",
    cyclePhase: "繁荣",
    defaultExpanded: false,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Roaring_Twenties",
    eraSummary: `【阶段概览】
1914—1929：一战参战与1920—21硬着陆后，柯立芝减税与信贷扩张推动1920年代股市繁荣，1929年崩盘终结本阶段。

【繁荣动力】
战时产能→和平转换；1922—29消费信贷与汽车普及；柯立芝减税；联储1920s宽松倾向。

【萧条/危机成因】
1920—21严重衰退；农业持续萧条；杠杆与保证金交易；1929年10月崩盘。

【制度与结构】
战时价格管制与复员；禁酒与地下经济；关税（1922/1930前奏）；金本位国际体系。

【Wikipedia 延伸阅读】
Roaring Twenties 条目。`,
  },
  {
    seedKey: "us-era-great-depression",
    tag: "大萧条",
    title: "大萧条",
    dateFrom: "1929-10-01",
    dateTo: "1939-08-31",
    cyclePhase: "萧条",
    defaultExpanded: false,
    wikipediaUrl:
      "https://en.wikipedia.org/wiki/Great_Depression_in_the_United_States",
    eraSummary: `【阶段概览】
1929—1939大萧条：崩盘、银行挤兑、贸易崩溃与1937二次衰退；新政重塑监管与社保体系，1933—37局部复苏。

【繁荣动力】
1933—37新政刺激与银行重组带来局部复苏（非全面繁荣）。

【萧条/危机成因】
1929崩盘与财富效应崩溃；金本位约束；1930斯姆特-霍利关税；1937财政/货币过早紧缩。

【制度与结构】
新政立法（银行、证券、社保、劳工）；脱离金本位；FDIC与SEC；联邦支出角色扩大。

【Wikipedia 延伸阅读】
Great Depression in the U.S. 条目。`,
  },
  {
    seedKey: "us-era-ww2",
    tag: "二战动员",
    title: "二战动员",
    dateFrom: "1939-09-01",
    dateTo: "1945-09-02",
    cyclePhase: "战争动员",
    defaultExpanded: false,
    wikipediaUrl:
      "https://en.wikipedia.org/wiki/United_States_home_front_during_World_War_II",
    eraSummary: `【阶段概览】
1939—1945二战：租借法案与国防工业动员实现充分就业，价格管制与配给抑制通胀，1944布雷顿森林规划战后秩序。

【繁荣动力】
国防工业全速运转；女性与少数族裔进入劳动力；技术扩散（雷达、合成橡胶等）。

【萧条/危机成因】
配给与资源重分配；战后复员与需求切换隐忧；战时通胀压力被管制压制。

【制度与结构】
战时生产委员会；价格与工资管制；布雷顿森林与IMF/世界银行；1944年GI Bill立法基础。

【Wikipedia 延伸阅读】
U.S. home front during WWII 条目。`,
  },
  {
    seedKey: "us-era-golden-age",
    tag: "战后黄金年代",
    title: "战后秩序与黄金年代",
    dateFrom: "1945-09-03",
    dateTo: "1973-10-16",
    cyclePhase: "繁荣",
    defaultExpanded: false,
    wikipediaUrl:
      "https://en.wikipedia.org/wiki/Post%E2%80%93World_War_II_economic_expansion",
    eraSummary: `【阶段概览】
1945—1973战后扩张：布雷顿森林美元体系、婴儿潮、郊区建设与制造业巅峰；1971尼克松冲击与1973石油危机终结本阶段。

【繁荣动力】
GI Bill与高等教育扩张；州际高速与汽车社会；1960s制造业全盛；美元作为储备货币的低融资成本。

【萧条/危机成因】
朝鲜/越南战争财政负担；1971关闭黄金窗口；1973第一次石油禁运与滞胀开端。

【制度与结构】
布雷顿森林→尼克松冲击；民权与劳动力市场变化；跨国公司与全球化起步。

【Wikipedia 延伸阅读】
Post–WWII economic expansion 条目。`,
  },
  {
    seedKey: "us-era-stagflation",
    tag: "滞胀时代",
    title: "滞胀与沃尔克紧缩",
    dateFrom: "1973-10-17",
    dateTo: "1982-11-30",
    cyclePhase: "萧条",
    defaultExpanded: false,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Stagflation_in_the_United_States",
    eraSummary: `【阶段概览】
1973—1982滞胀：两次石油冲击、双位通胀、1974—75与1980—82衰退；沃尔克联储以高利率重塑通胀预期。

【繁荣动力】
能源州与国防工业局部景气；1980年代前技术投资萌芽。

【萧条/危机成因】
石油价格冲击；工资—物价螺旋；1980年货币控制法与沃尔克紧缩；1982拉美债务危机外溢。

【制度与结构】
联储独立性强化；浮动汇率；1981里根减税与放松管制议程启动。

【Wikipedia 延伸阅读】
Stagflation in the U.S. 条目。`,
  },
  {
    seedKey: "us-era-neoliberal-boom",
    tag: "新自由主义繁荣",
    title: "里根—克林顿长扩张",
    dateFrom: "1982-12-01",
    dateTo: "2000-03-10",
    cyclePhase: "繁荣",
    defaultExpanded: false,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Great_Moderation",
    eraSummary: `【阶段概览】
1982—2000长扩张：降息、金融化、IT革命与全球化；1987与1998危机被政策化解，2000 dot-com破裂终结本阶段。

【繁荣动力】
沃尔克后低通胀锚；金融创新与信贷扩张；IT/互联网投资潮；1990s财政盈余与全球化分工。

【萧条/危机成因】
1987股灾；S&L危机遗留；1998 LTCM；2000年纳斯达克泡沫破裂。

【制度与结构】
格拉斯-斯蒂格尔废除（1999）；NAFTA与WTO；广场/卢浮宫协议塑造汇率协作。

【Wikipedia 延伸阅读】
Great Moderation 条目。`,
  },
  {
    seedKey: "us-era-gfc",
    tag: "金融危机时代",
    title: "房地产泡沫与全球金融危机",
    dateFrom: "2000-03-11",
    dateTo: "2009-06-30",
    cyclePhase: "萧条",
    defaultExpanded: false,
    wikipediaUrl: "https://en.wikipedia.org/wiki/2008_financial_crisis",
    eraSummary: `【阶段概览】
2000—2009：反恐战争财政、2003—07住房信贷周期、2008年雷曼倒闭与大衰退；政策以TARP与刺激应对。

【繁荣动力】
2003—07低利率与住房/信贷驱动消费；金融工程与影子银行扩张。

【萧条/危机成因】
9/11冲击与战争成本；次贷危机与杠杆去化；2008系统性银行危机；2007—09大衰退。

【制度与结构】
联储零利率与QE前奏；Dodd-Frank立法讨论起点；GSE与影子银行监管反思。

【Wikipedia 延伸阅读】
2008 financial crisis 条目。`,
  },
  {
    seedKey: "us-era-qe",
    tag: "QE时代",
    title: "量化宽松与低利率",
    dateFrom: "2009-07-01",
    dateTo: "2019-12-31",
    cyclePhase: "混合",
    defaultExpanded: false,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Quantitative_easing",
    eraSummary: `【阶段概览】
2009—2019：三轮QE、taper与2015加息正常化；科技巨头与页岩革命并行，2017税改与贸易战扰动。

【繁荣动力】
超长低利率与QE支撑资产价格；页岩革命改善能源贸易平衡；FAANG与平台经济。

【萧条/危机成因】
2011债务上限僵局；2013 taper tantrum；2015—16制造业衰退；贸易战关税不确定性。

【制度与结构】
联储资产负债表扩张；宏观审慎与压力测试；产业政策回归前夜。

【Wikipedia 延伸阅读】
Quantitative easing 条目。`,
  },
  {
    seedKey: "us-era-post-covid",
    tag: "疫情后时代",
    title: "疫情、财政刺激与通胀再抬头",
    dateFrom: "2020-01-01",
    dateTo: "present",
    cyclePhase: "混合",
    defaultExpanded: false,
    wikipediaUrl:
      "https://en.wikipedia.org/wiki/Economic_impact_of_the_COVID-19_pandemic_in_the_United_States",
    eraSummary: `【阶段概览】
2020—今：疫情断崖、史无前例财政/货币刺激、2022—23通胀与快速加息、2023区域银行压力与AI/产业政策新周期。

【繁荣动力】
2020—21财政转移与货币宽松；2021复苏；2023— AI资本开支与CHIPS/IRA产业政策。

【萧条/危机成因】
2020 Q2经济断崖；2022—23通胀与联储紧缩；2023 SVB等区域银行压力；供应链扰动。

【制度与结构】
CARES/ARPA大规模转移；通胀削减法与芯片法；联储QT与利率正常化实验。

【Wikipedia 延伸阅读】
COVID-19 economic impact (U.S.) 条目。`,
  },
];

/** 按 occurredAt 判定子事件归属时代 */
export function findEraForDate(dateStr, eras = US_HISTORY_ERAS) {
  const d = dateStr.slice(0, 10);
  for (const era of eras) {
    const to =
      era.dateTo === "present" || era.dateTo === "今"
        ? "9999-12-31"
        : era.dateTo.slice(0, 10);
    if (d >= era.dateFrom.slice(0, 10) && d <= to) return era;
  }
  return eras[eras.length - 1];
}
