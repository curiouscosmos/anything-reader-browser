// @ts-nocheck
/**
 */

class TextPreprocessor {
  constructor() {
    this.commonExcludeChars = [
      '•',  // bullet point
      '『',  // left double bracket
      '』',  // right double bracket
      '—',  // em dash
      '◇',  // diamond/white diamond
      '◀',  // left pointing triangle
      '▶',  // right pointing triangle
      '▲',  // up pointing triangle
      '▼',  // down pointing triangle
      '◁',  // white left pointing triangle
      '▷',  // white right pointing triangle
      '◄',  // left pointing small triangle
      '►',  // right pointing small triangle
      '■',  // black square
      '□',  // white square
      '▢'   // white square with rounded corners
    ];

    this.commonReplacements = {
      '·': '-',
      '…': '.',
      '(': ' ',
      ')': ' '
    };

    // ============================================
    // ============================================
    this.koreanConversions = {
      surnames: {
      '金': '김',
      '李': '이',
      '朴': '박',
      '崔': '최',
      '鄭': '정',
      '姜': '강',
      '趙': '조',
      '尹': '윤',
      '張': '장',
      '林': '임',
      '韓': '한',
      '吳': '오',
      '徐': '서',
      '權': '권',
      '黃': '황',
      '許': '허',
      '宋': '송',
      '申': '신',
      '柳': '유',
      '洪': '홍',

      '孫': '손',
      '安': '안',
      '梁': '양',
      '盧': '노',
      '文': '문',
      '全': '전',
      '白': '백',
      '高': '고',
      '田': '전',
      '嚴': '엄',
      '車': '차',
      '都': '도',
      '南': '남',
      '方': '방',
      '元': '원',
      '孔': '공',
      '孟': '맹',
      '咸': '함',
      '成': '성',
      '邊': '변',
      '卞': '변',
      '蔡': '채',
      '丁': '정',
      '陳': '진',
      '千': '천',
      '太': '태',
      '表': '표',
      '皮': '피',
      '河': '하',
      '閔': '민',

      '劉': '유',
      '周': '주',
      '朱': '주',
      '馬': '마',
      '任': '임',
      '王': '왕',
      '呂': '여',
      '羅': '나',
      '具': '구',
      '禹': '우',
      '庾': '유',
      '曺': '조',
      '辛': '신',
      '愼': '신',
      '沈': '심',
      '琴': '금',
      '秋': '추',
      '兪': '유',
      '余': '여',
      '殷': '은',
      '印': '인',
      '芮': '예',
      '葉': '엽',
      '于': '우',
      '魚': '어',
      '容': '용',
      '龍': '용',
      '廉': '염',
      '陸': '육',
      '睦': '목',
      '明': '명',
      '牟': '모',
      '毛': '모'
      },

      commonHanja: {
      '行': '행',

      '母': '모',
      '父': '부',
      '夫': '부',
      '婦': '부',
      '祖': '조',
      '子': '자',
      '女': '녀',
      '兄': '형',
      '弟': '제',
      '族': '족',

      '大': '대',
      '小': '소',
      '新': '신',
      '舊': '구',
      '高': '고',
      '低': '저',
      '短': '단',
      '多': '다',
      '少': '소',
      '強': '강',
      '弱': '약',
      '正': '정',
      '負': '부',
      '上': '상',
      '下': '하',
      '前': '전 ',
      '後': '후',
      '內': '내',
      '外': '외',
      '左': '좌',
      '右': '우',
      '中': '중',
      '間': '간',
      '時': '시',
      '分': '분',
      '年': '년',
      '月': '월',
      '日': '일',
      '週': '주',
      '國': '국',
      '家': '가',
      '會': '회',
      '社': '사',
      '院': '원',
      '廳': '청',
      '部': '부',
      '局': '국',
      '處': '처',
      '所': '소',
      '館': '관',
      '校': '교',
      '學': '학',
      '生': '생',
      '師': '사',
      '長': '장',
      '員': '원',
      '職': '직',
      '業': '업',
      '金': '금',
      '銀': '은',
      '錢': '전',
      '元': '원',
      '圓': '원',
      '萬': '만',
      '億': '억',
      '市': '시',
      '場': '장',
      '價': '가',
      '値': '치',
      '費': '비',
      '稅': '세',
      '利': '리',
      '益': '익',
      '損': '손',
      '得': '득',
      '失': '실'
      },

      countryNames: {
        '美': '미국',
        '中': '중국',
        '日': '일본',
        '英': '영국',
        '佛': '프랑스',
        '獨': '독일',
        '露': '러시아',
        '韓': '한국',
        '北': '북한',
        '南': '남한',
        '蘇': '소련',
        '伊': '이탈리아',
        '西': '스페인',
        '加': '캐나다',
        '澳': '호주',
        '印': '인도',
        '越': '베트남',
        '泰': '태국',
        '新': '싱가포르',
        '馬': '말레이시아',
        '菲': '필리핀',
        '印尼': '인도네시아'
      },

      symbolsAndUnits: {
        '%': '퍼센트',
        '％': '퍼센트',

        'mm': '밀리미터',
        'cm': '센티미터',
        'm': '미터',
        'km': '킬로미터',
        'inch': '인치',
        'in': '인치',
        'ft': '피트',
        'yd': '야드',
        'mile': '마일',

        'mg': '밀리그램',
        'kg': '킬로그램',
        'ton': '톤',
        'oz': '온스',
        'ounce': '온스',
        'lb': '파운드',
        'pound': '파운드',

        'ml': '밀리리터',
        'l': '리터',
        'cc': '씨씨',
        'gal': '갤런',
        'gallon': '갤런',

        '℃': '도',
        '℉': '화씨',

        '$': '달러',
        'USD': '달러',
        '€': '유로',
        'EUR': '유로',
        '£': '파운드',
        'GBP': '파운드',
        '¥': '엔',
        'JPY': '엔',
        '₩': '원',
        'KRW': '원',
        'CNY': '위안',
        'RMB': '위안',

        '@': '골뱅이',
        '#': '샵,',
        '&': '엔',
        '*': '별표',
        '/': '슬래시',
        '\\': '백슬래시',


        'sec': '초',
        'second': '초',
        'min': '분',
        'minute': '분',
        'hr': '시간',
        'hour': '시간',
        'day': '일',
        'week': '주',
        'month': '월',
        'year': '년',

        'bit': '비트',
        'byte': '바이트',
        'KB': '킬로바이트',
        'MB': '메가바이트',
        'GB': '기가바이트',
        'TB': '테라바이트',
        'PB': '페타바이트',

        'kW': '킬로와트',
        'Hz': '헤르츠',
        'kHz': '킬로헤르츠',
        'MHz': '메가헤르츠',
        'GHz': '기가헤르츠'
      }
    };

    this.languageSpecificReplacements = {
      'en': {
      },
      'es': {
      },
      'fr': {
      },
      'pt': {
      }
    };
  }

  /**
   */
  preprocess(text) {
    if (!text || typeof text !== 'string') {
      return text || '';
    }

    let processedText = text;

    processedText = this.restoreCensoredWords(processedText);

    processedText = this.applyCommonReplacements(processedText);

    processedText = this.removeExcludeChars(processedText);

    const detectedLanguage = this.detectLanguage(processedText);
    processedText = this.applyLanguageSpecificReplacements(processedText, detectedLanguage);

    if (detectedLanguage === 'ko') {
      processedText = this.convertToHangul(processedText);
    }

    processedText = this.normalizeWhitespace(processedText);

    return processedText.trim();
  }

  /**
   */
  restoreCensoredWords(text) {
    let result = text;

    const censoredWords = {
      's\\*{3,}': 'shit',
      'sh\\*{2,}': 'shit',
      's\\*{2}t': 'shit',
      's\\*{1,}h\\*{1,}t': 'shit',

      'f\\*{3,}': 'fuck',
      'fu\\*{2,}': 'fuck',
      'f\\*{2}k': 'fuck',
      'f\\*{1,}c\\*{1,}k': 'fuck',
      'f\\*{1,}u\\*{1,}c\\*{1,}k': 'fuck',

      'b\\*{4,}': 'bitch',
      'bi\\*{3,}': 'bitch',
      'bit\\*{2,}': 'bitch',
      'b\\*{1,}i\\*{1,}t\\*{1,}c\\*{1,}h': 'bitch',

      'a\\*{2,}': 'ass',
      'a\\*{1,}s\\*{1,}s': 'ass',

      'd\\*{3,}': 'damn',
      'da\\*{2,}': 'damn',
      'dam\\*{1,}': 'damn',
      'd\\*{1,}a\\*{1,}m\\*{1,}n': 'damn',

      'h\\*{3,}': 'hell',
      'he\\*{2,}': 'hell',
      'hel\\*{1,}': 'hell',
      'h\\*{1,}e\\*{1,}l\\*{1,}l': 'hell',

      'c\\*{3,}': 'crap',
      'cr\\*{2,}': 'crap',
      'cra\\*{1,}': 'crap',
      'c\\*{1,}r\\*{1,}a\\*{1,}p': 'crap',

      'p\\*{3,}': 'piss',
      'pi\\*{2,}': 'piss',
      'pis\\*{1,}': 'piss',

      'w\\*{3,}': 'whore',
      'wh\\*{3,}': 'whore',

      'bas\\*{4,}': 'bastard',

      'm\\*{3,}': 'motherfucker',
      'mo\\*{5,}': 'motherfucker'
    };

    for (const [pattern, word] of Object.entries(censoredWords)) {
      if (pattern.includes('\\*')) {
        const regex = new RegExp(`(^|\\W)${pattern}(?=\\W|$)`, 'gi');
        result = result.replace(regex, (match, prefix) => prefix + word);
      } else {
        const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
        result = result.replace(regex, word);
      }
    }

    const generalPattern = /\b([a-z])\*{2,}\b/gi;
    result = result.replace(generalPattern, (match, firstLetter) => {
      const knownWords = {
        's': 'shit',
        'f': 'fuck',
        'b': 'bitch',
        'a': 'ass',
        'd': 'damn',
        'h': 'hell',
        'c': 'crap',
        'p': 'piss'
      };

      const lowerFirst = firstLetter.toLowerCase();
      return knownWords[lowerFirst] || match;
    });

    return result;
  }

  /**
   */
  applyCommonReplacements(text) {
    let result = text;

    for (const [original, replacement] of Object.entries(this.commonReplacements)) {
      result = result.replace(new RegExp(this.escapeRegex(original), 'g'), replacement);
    }

    return result;
  }

  /**
   */
  removeExcludeChars(text) {
    let result = text;

    const excludePattern = new RegExp(
      this.commonExcludeChars.map(char => this.escapeRegex(char)).join('|'),
      'g'
    );

    result = result.replace(excludePattern, '');

    return result;
  }

  /**
   */
  detectLanguage(text) {

    const koreanPattern = /[\uAC00-\uD7A3]/;
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;
    const chinesePattern = /[\u4E00-\u9FFF]/;

    if (koreanPattern.test(text)) {
      return 'ko';
    } else if (japanesePattern.test(text)) {
      return 'ja';
    } else if (chinesePattern.test(text)) {
      return 'zh';
    }

    return 'en';
  }

  /**
   */
  applyLanguageSpecificReplacements(text, language) {
    const replacements = this.languageSpecificReplacements[language];

    if (!replacements || Object.keys(replacements).length === 0) {
      return text;
    }

    let result = text;

    for (const [original, replacement] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${this.escapeRegex(original)}\\b`, 'gi');
      result = result.replace(regex, replacement);
    }

    return result;
  }

  /**
   */
  convertToHangul(text) {
    let result = text;

    for (const [hanja, hangul] of Object.entries(this.koreanConversions.countryNames)) {
      const regex = new RegExp(this.escapeRegex(hanja), 'g');
      result = result.replace(regex, hangul);
    }

    for (const [hanja, hangul] of Object.entries(this.koreanConversions.surnames)) {
      const pattern1 = new RegExp(`(^|\\s)${this.escapeRegex(hanja)}(?=\\s|[가-힣])`, 'g');
      result = result.replace(pattern1, `$1${hangul}`);

      const pattern2 = new RegExp(`${this.escapeRegex(hanja)}(?=씨|총리|대통령|장관|의원|회장|사장|부장|과장|팀장|선생|님|군|양)`, 'g');
      result = result.replace(pattern2, hangul);
    }

    for (const [hanja, hangul] of Object.entries(this.koreanConversions.commonHanja)) {
      const regex = new RegExp(this.escapeRegex(hanja), 'g');
      result = result.replace(regex, hangul);
    }

    for (const [symbol, hangul] of Object.entries(this.koreanConversions.symbolsAndUnits)) {
      const pattern1 = new RegExp(`(\\d+)${this.escapeRegex(symbol)}(?=\\W|$)`, 'gi');
      result = result.replace(pattern1, (match, number) => {
        return number + hangul;
      });

      const pattern2 = new RegExp(`(\\d+)\\s+${this.escapeRegex(symbol)}(?=\\W|$)`, 'gi');
      result = result.replace(pattern2, (match, number) => {
        return number + ' ' + hangul;
      });
    }

    result = this.convertDateToHangul(result);

    result = this.convertSingleLetterSsi(result);

    return result;
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  convertSingleLetterSsi(text) {
    const letterMap = {
      'A': '에이',
      'B': '비',
      'C': '씨',
      'D': '디',
      'E': '이',
      'F': '에프',
      'G': '지',
      'H': '에이치',
      'I': '아이',
      'J': '제이',
      'K': '케이',
      'L': '엘',
      'M': '엠',
      'N': '엔',
      'O': '오',
      'P': '피',
      'Q': '큐',
      'R': '알',
      'S': '에스',
      'T': '티',
      'U': '유',
      'V': '브이',
      'W': '더블유',
      'X': '엑스',
      'Y': '와이',
      'Z': '제트'
    };

    const pattern = /(^|[^A-Za-z])([A-Za-z])(?:\s*|-)?(씨)/g;
    return text.replace(pattern, (match, pre, letter, ssi) => {
      const hangul = letterMap[letter.toUpperCase()];
      if (!hangul) return match;
      return pre + hangul + ssi;
    });
  }

  /**
   */
  numberToHangul(numStr) {
    const hangulNumbers = {
      '0': '',
      '1': '일',
      '2': '이',
      '3': '삼',
      '4': '사',
      '5': '오',
      '6': '육',
      '7': '칠',
      '8': '팔',
      '9': '구'
    };

    return numStr.split('').map(digit => hangulNumbers[digit] || digit).join('');
  }

  /**
   */
  numberToHangulPronunciation(numStr) {
    const num = parseInt(numStr, 10);
    if (isNaN(num) || num < 0) return numStr;

    if (num === 0) return '';

    const hangulNumbers = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

    if (num < 10) {
      return hangulNumbers[num];
    }

    const digits = numStr.split('').map(d => parseInt(d, 10));
    let result = '';

    if (digits.length >= 4 && digits[digits.length - 4] !== 0) {
      const thousand = digits[digits.length - 4];
      if (thousand === 1) {
        result += '천';
      } else {
        result += hangulNumbers[thousand] + '천';
      }
    }

    if (digits.length >= 3 && digits[digits.length - 3] !== 0) {
      const hundred = digits[digits.length - 3];
      if (hundred === 1) {
        result += '백';
      } else {
        result += hangulNumbers[hundred] + '백';
      }
    }

    if (digits.length >= 2 && digits[digits.length - 2] !== 0) {
      const ten = digits[digits.length - 2];
      if (ten === 1) {
        result += '십';
      } else {
        result += hangulNumbers[ten] + '십';
      }
    }

    if (digits.length >= 1 && digits[digits.length - 1] !== 0) {
      result += hangulNumbers[digits[digits.length - 1]];
    }

    return result;
  }

  /**
   */
  monthToHangul(month) {
    const num = typeof month === 'string' ? parseInt(month, 10) : month;

    if (num === 10) {
      return '시월';
    }

    return this.numberToHangulPronunciation(num.toString()) + '월';
  }

  /**
   */
  convertDateToHangul(text) {
    let result = text;

    const datePattern0 = /\b(\d{4})\.\s+(\d{1,2})\.\s+(\d{1,2})\./g;
    result = result.replace(datePattern0, (match, year, month, day) => {
      const yearHangul = this.numberToHangulPronunciation(year) + '년';
      const monthHangul = this.monthToHangul(month);
      const dayHangul = this.numberToHangulPronunciation(day) + '일';
      return yearHangul + ' ' + monthHangul + ' ' + dayHangul;
    });

    const datePattern1 = /\b(\d{4})\.(\d{1,2})\.(\d{1,2})\b/g;
    result = result.replace(datePattern1, (match, year, month, day) => {
      const yearHangul = this.numberToHangulPronunciation(year) + '년';
      const monthHangul = this.monthToHangul(month);
      const dayHangul = this.numberToHangulPronunciation(day) + '일';
      return yearHangul + ' ' + monthHangul + ' ' + dayHangul;
    });

    const datePattern1a = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
    result = result.replace(datePattern1a, (match, year, month, day) => {
      const yearHangul = this.numberToHangulPronunciation(year) + '년';
      const monthHangul = this.monthToHangul(month);
      const dayHangul = this.numberToHangulPronunciation(day) + '일';
      return yearHangul + ' ' + monthHangul + ' ' + dayHangul;
    });

    const datePattern1b = /\b(\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    result = result.replace(datePattern1b, (match, year, month, day) => {
      const yearHangul = this.numberToHangulPronunciation(year) + '년';
      const monthHangul = this.monthToHangul(month);
      const dayHangul = this.numberToHangulPronunciation(day) + '일';
      return yearHangul + ' ' + monthHangul + ' ' + dayHangul;
    });

    const yearShortPattern = /\b(\d{4})(~{2,})\b/g;
    result = result.replace(yearShortPattern, (match, fullYear) => {
      const shortYear = fullYear.substring(2);
      const hangul = this.numberToHangulPronunciation(shortYear);
      return hangul + '년';
    });

    const yearShortPattern2 = /\b(\d{2})(~{2,})\b/g;
    result = result.replace(yearShortPattern2, (match, year) => {
      const hangul = this.numberToHangulPronunciation(year);
      return hangul + '년';
    });

    const yearPattern = /(\d+)(년)/g;
    result = result.replace(yearPattern, (match, numStr) => {
      const hangul = this.numberToHangulPronunciation(numStr);
      return hangul + '년';
    });

    const monthPattern = /(\d+)(월)/g;
    result = result.replace(monthPattern, (match, numStr) => {
      return this.monthToHangul(numStr);
    });

    const dayPattern = /(\d+)(일)/g;
    result = result.replace(dayPattern, (match, numStr) => {
      const hangul = this.numberToHangulPronunciation(numStr);
      return hangul + '일';
    });

    return result;
  }

  /**
   */
  normalizeWhitespace(text) {
    return text.replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n');
  }

  /**
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   */
  addLanguageReplacements(language, replacements) {
    if (!this.languageSpecificReplacements[language]) {
      this.languageSpecificReplacements[language] = {};
    }

    Object.assign(this.languageSpecificReplacements[language], replacements);
  }

  /**
   */
  addExcludeChars(chars) {
    const charsArray = Array.isArray(chars) ? chars : [chars];
    this.commonExcludeChars.push(...charsArray);
  }
}

if (typeof window !== 'undefined') {
  window.textPreprocessor = new TextPreprocessor();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextPreprocessor;
}

