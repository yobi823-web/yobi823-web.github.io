(() => {
  'use strict';
  const STORAGE_KEY = 'tanto:study:sosoku-1:v1';
  const $ = id => document.getElementById(id);
  const labels = {new:'未学習',again:'もう一度',known:'覚えた'};
  let deck, questions = [], queue = [], blanks = [], position = 0, answered = false, completed = false, toastTimer;
  let state = {records:{},category:'',filter:'all',shuffle:false,currentId:''};
  let storageAvailable = true;

  function readState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!stored || typeof stored !== 'object') return;
      const records = {};
      if (stored.records && typeof stored.records === 'object') {
        for (const [id, value] of Object.entries(stored.records)) {
          if (value && ['known','again'].includes(value.status)) records[id] = value;
        }
      }
      state = {
        records,
        category:typeof stored.category === 'string' ? stored.category : '',
        filter:['all','new','again','known'].includes(stored.filter) ? stored.filter : 'all',
        shuffle:stored.shuffle === true,
        currentId:typeof stored.currentId === 'string' ? stored.currentId : ''
      };
    } catch (_) { storageAvailable = false; }
  }

  function save() {
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}
    catch (_) {storageAvailable = false;}
    $('saveStatus').textContent = storageAvailable
      ? '学習記録と続きの位置は、この端末に保存されます。'
      : 'この環境では学習記録を保存できません。画面を閉じると記録が失われる場合があります。';
  }

  function migrateGroupedState() {
    for (const q of questions) {
      if (!Array.isArray(q.mergedFrom) || !q.mergedFrom.length) continue;
      if (q.mergedFrom.includes(state.currentId)) state.currentId = q.id;
      if (state.records[q.id]) continue;
      const previous = q.mergedFrom.map(id => state.records[id]);
      const mergedStatus = previous.some(record => record?.status === 'again') ? 'again'
        : previous.every(record => record?.status === 'known') ? 'known' : null;
      if (mergedStatus) {
        const updatedAt = previous.map(record => record?.updatedAt).filter(value => typeof value === 'string').sort().pop();
        state.records[q.id] = {status:mergedStatus, ...(updatedAt ? {updatedAt} : {})};
      }
    }
  }

  function status(id) { return state.records[id]?.status || 'new'; }
  function inCategory(q) {return !state.category || q.category === state.category;}
  function scopedQuestions() {return questions.filter(inCategory);}
  function selectedQuestions() {return scopedQuestions().filter(q => state.filter === 'all' || status(q.id) === state.filter);}
  function counts(list) {
    return list.reduce((n,q) => {n[status(q.id)]++; return n;}, {new:0,again:0,known:0});
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i],list[j]] = [list[j],list[i]];
    }
    return list;
  }

  function begin({resume=false}={}) {
    queue = selectedQuestions();
    if (state.shuffle) shuffle(queue);
    position = resume ? Math.max(0,queue.findIndex(q => q.id === state.currentId)) : 0;
    completed = false;
    showQuestion();
  }

  function renderStats() {
    const scoped = scopedQuestions(), c = counts(scoped);
    $('stats').textContent = `この分野 ${scoped.length}問 · 未学習 ${c.new} · もう一度 ${c.again} · 覚えた ${c.known}`;
    for (const option of $('filter').options) {
      option.textContent = option.value === 'all' ? `すべて（${scoped.length}）` : `${labels[option.value]}（${c[option.value]}）`;
    }
    $('shuffle').textContent = state.shuffle ? 'ランダム順' : '順番どおり';
    $('shuffle').setAttribute('aria-pressed',String(state.shuffle));
    $('listCount').textContent = `${queue.length}問`;
  }

  function showQuestion({focus=false}={}) {
    answered = false;
    $('complete').hidden = true;
    $('empty').hidden = queue.length > 0;
    $('study').hidden = queue.length === 0;
    renderStats();
    if (!queue.length) {
      $('emptyMessage').textContent = state.filter === 'again'
        ? '「もう一度」にした問題が、ここに表示されます。'
        : '分野や学習状況を変更すると、別の問題を学習できます。';
      state.currentId = '';
      renderList();save();return;
    }
    const q = queue[position];
    state.currentId = q.id;
    renderCloze(q);
    $('position').textContent = `${position + 1} / ${queue.length} 問`;
    $('categoryLabel').textContent = q.category;
    $('progress').max = queue.length;
    $('progress').value = position;
    $('previous').disabled = position === 0;
    $('next').textContent = position === queue.length - 1 ? 'この範囲を終える' : '次の問題';
    $('currentStatus').textContent = labels[status(q.id)];
    renderList();save();
    if (focus) focusQuestion();
  }

  function focusQuestion() {
    $('question').focus({preventScroll:true});
    const top = $('study').getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight / 2) $('study').scrollIntoView({block:'start',behavior:'auto'});
  }

  function renderCloze(q) {
    const fragment = document.createDocumentFragment();
    blanks = [];
    const heading = document.createElement('h2');
    heading.className = 'cloze-stem';
    appendClozeParts(heading,q.promptParts || q.parts);
    fragment.append(heading);
    if (q.itemParts) {
      const list = document.createElement('ul');
      list.className = 'cloze-items';
      for (const parts of q.itemParts) {
        const item = document.createElement('li');
        appendClozeParts(item,parts);
        list.append(item);
      }
      fragment.append(list);
    }
    $('question').replaceChildren(fragment);
    updateClozeControls();
  }

  function appendClozeParts(container,parts) {
    for (const part of parts) {
      if (!part.blank) {container.append(document.createTextNode(part.text));continue;}
      const button = document.createElement('button');
      button.type = 'button';button.className = 'cloze';
      const content = document.createElement('span');
      content.className = 'cloze-answer';content.textContent = part.text;
      button.append(content);
      const blank = {button,content,text:part.text,index:blanks.length+1,revealed:false,seen:false};
      blanks.push(blank);
      setBlank(blank,false);
      button.addEventListener('click',() => {setBlank(blank,!blank.revealed);updateClozeControls();});
      container.append(button);
    }
  }

  function setBlank(blank,revealed) {
    blank.revealed = revealed;
    if (revealed) blank.seen = true;
    blank.button.classList.toggle('is-revealed',revealed);
    blank.button.setAttribute('aria-pressed',String(revealed));
    blank.button.setAttribute('aria-label',revealed ? `${blank.text}（タップして隠す）` : `黒塗り${blank.index}を表示`);
    blank.content.setAttribute('aria-hidden',String(!revealed));
  }

  function updateClozeControls() {
    const visible = blanks.filter(blank => blank.revealed).length;
    answered = blanks.length > 0 && blanks.every(blank => blank.seen);
    $('clozeCount').textContent = `${visible} / ${blanks.length}か所表示`;
    $('reveal').textContent = visible === blanks.length ? 'すべて隠す' : 'すべて表示';
    $('known').disabled = !answered;
    $('again').disabled = !answered;
  }

  function reveal() {
    if (!queue.length || completed) return;
    const show = blanks.some(blank => !blank.revealed);
    blanks.forEach(blank => setBlank(blank,show));
    updateClozeControls();
  }

  function next() {
    if (!queue.length || completed) return;
    if (position < queue.length - 1) {position++;showQuestion({focus:true});}
    else finish();
  }

  function grade(value) {
    if (!answered || completed || !queue[position]) return;
    state.records[queue[position].id] = {status:value,updatedAt:new Date().toISOString()};
    save();
    notify(`${labels[value]}に記録しました`);
    next();
  }

  function finish() {
    completed = true;
    const c = counts(queue);
    $('study').hidden = true;
    $('complete').hidden = false;
    $('completeStats').textContent = `${queue.length}問のうち、覚えた ${c.known}問・もう一度 ${c.again}問・未学習 ${c.new}問。`;
    $('reviewAgain').disabled = counts(scopedQuestions()).again === 0;
    renderStats();renderList();save();
    $('restart').focus({preventScroll:true});
  }

  function notify(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => {$('toast').hidden = true;},1700);
  }

  function renderList() {
    if (!$('questionList').open) return;
    const fragment = document.createDocumentFragment();
    queue.forEach((q,i) => {
      const button = document.createElement('button');
      button.type = 'button';button.className = 'list-row';
      button.setAttribute('aria-current',String(!completed && i === position));
      const number = document.createElement('span');number.className = 'list-number';number.textContent = String(i+1);
      const text = document.createElement('span');text.className = 'list-text';
      text.textContent = (q.promptParts || q.parts).map(part => part.blank ? '［黒塗り］' : part.text).join('') + (q.items ? `（${q.items.length}項目）` : '');
      const tag = document.createElement('span');tag.className = `list-tag ${status(q.id)}`;tag.textContent = labels[status(q.id)];
      button.append(number,text,tag);
      button.addEventListener('click',() => {position=i;completed=false;$('questionList').open=false;showQuestion({focus:true});});
      fragment.append(button);
    });
    $('list').replaceChildren(fragment);
  }

  function renderReview() {
    const fragment = document.createDocumentFragment();
    for (const item of deck.review || []) {
      const container = document.createElement('section');container.className='review-note';
      const heading = document.createElement('h3');heading.textContent=item.title;
      const note = document.createElement('p');note.textContent=item.note;
      container.append(heading,note);fragment.append(container);
    }
    $('reviewList').replaceChildren(fragment);
    $('reviewCount').textContent=`${(deck.review || []).length}件`;
  }

  function showAll() {
    state.filter = 'all';state.category = '';
    $('filter').value = 'all';$('category').value = '';
    begin();
  }

  function bind() {
    $('reveal').addEventListener('click',reveal);
    $('known').addEventListener('click',() => grade('known'));
    $('again').addEventListener('click',() => grade('again'));
    $('next').addEventListener('click',next);
    $('previous').addEventListener('click',() => {if(position>0){position--;showQuestion({focus:true});}});
    $('category').addEventListener('change',event => {state.category=event.target.value;begin();});
    $('filter').addEventListener('change',event => {state.filter=event.target.value;begin();});
    $('shuffle').addEventListener('click',() => {state.shuffle=!state.shuffle;begin();});
    $('showAll').addEventListener('click',showAll);
    $('restart').addEventListener('click',() => begin());
    $('reviewAgain').addEventListener('click',() => {state.filter='again';$('filter').value='again';begin();});
    $('questionList').addEventListener('toggle',renderList);
    document.addEventListener('keydown',event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || completed) return;
      if (event.target.closest('button,select,input,textarea,a,summary')) return;
      if (event.code === 'Space') {event.preventDefault();reveal();}
      if (event.key === 'ArrowRight') {event.preventDefault();next();}
      if (event.key === 'ArrowLeft' && position>0) {event.preventDefault();position--;showQuestion({focus:true});}
    });
  }

  function parseCloze(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('教材の文章がありません');
    const parts = [];
    let end = 0;
    for (const match of text.matchAll(/\[\[([^\[\]\r\n]+)\]\]/g)) {
      parts.push({text:text.slice(end,match.index),blank:false},{text:match[1],blank:true});
      end = match.index + match[0].length;
    }
    parts.push({text:text.slice(end),blank:false});
    if (parts.some(part => !part.blank && /\[\[|\]\]/.test(part.text))) throw new Error('黒塗りの形式が正しくありません');
    return parts;
  }

  async function init() {
    try {
      const response = await fetch('./decks/tanto-sosoku-1.json?v=group1');
      if (!response.ok) throw new Error(`教材を取得できませんでした (${response.status})`);
      deck = await response.json();
      if (!Array.isArray(deck.questions) || !deck.questions.length) throw new Error('教材に問題がありません');
      questions = deck.questions;
      const ids = new Set();
      for (const q of questions) {
        if (!q.id || ids.has(q.id) || typeof q.cloze!=='string' || !q.cloze.trim() || typeof q.category!=='string') throw new Error('教材の形式が正しくありません');
        q.parts = parseCloze(q.cloze);
        if (!q.parts.some(part => part.blank)) throw new Error('黒塗りがありません');
        if (q.items !== undefined) {
          if (!Array.isArray(q.items) || !q.items.length) throw new Error('箇条書きの形式が正しくありません');
          q.promptParts = parseCloze(q.prompt);
          q.itemParts = q.items.map(parseCloze);
          if (q.itemParts.some(parts => !parts.some(part => part.blank))) throw new Error('箇条書きに黒塗りがありません');
        }
        ids.add(q.id);
      }
      readState();
      migrateGroupedState();
      const categories = [...new Set(questions.map(q => q.category))];
      if (!categories.includes(state.category)) state.category='';
      for (const category of categories) {
        const option = document.createElement('option');option.value=category;option.textContent=category;$('category').append(option);
      }
      $('deckTitle').textContent = deck.title;
      $('totalCount').textContent = `${questions.length}問 · ${categories.length}分野`;
      $('category').value=state.category;$('filter').value=state.filter;
      bind();renderReview();
      $('loading').hidden=true;$('app').hidden=false;
      begin({resume:true});
    } catch(error) {
      console.error('タントー君:',error);
      $('loading').hidden=true;$('loadError').hidden=false;
    }
  }
  $('retryLoad').addEventListener('click',() => location.reload());
  init();
})();
