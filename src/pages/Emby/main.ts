import {pageInterface} from "./../pageInterface";

var item:any = undefined;

async function getApiKey(){
  return api.storage.get('emby_Api_Key');
}

async function setApiKey(key){
  return api.storage.set('emby_Api_Key', key);
}

async function getBase(){
  return api.storage.get('emby_Base');
}

async function setBase(key){
  return api.storage.set('emby_Base', key);
}

async function checkApi(page){
  var videoEl = $('video');
  if(videoEl.length){
    $('html').addClass('miniMAL-hide');
    var url = videoEl.attr('src');
    con.log(url);
    //@ts-ignore
    if(/blob\:/i.test(url)){
      var apiBase:any = await getBase();
      var itemId = await returnPlayingItemId();
      var apiKey = await getApiKey();
    }else{
      var apiBase:any = url!.split('/').splice(0,4).join('/');
      var itemId = utils.urlPart(url, 5);
      var apiKey = await getApiKey();
      setBase(apiBase);
    }
    var reqUrl = apiBase+'/Items?ids='+itemId+'&api_key='+apiKey;
    con.log('reqUrl', reqUrl, 'base', apiBase, 'apiKey', apiKey);

    api.request.xhr('GET', reqUrl).then((response) => {
      var data = JSON.parse(response.responseText);
      item = data.Items[0];
      reqUrl = apiBase+'/Genres?Ids='+item.SeriesId+'&api_key='+apiKey;
      con.log(data);
      return api.request.xhr('GET', reqUrl);
    }).then((response) => {
      var genres:any = JSON.parse(response.responseText);
      con.log('genres', genres);
      for (var i = 0; i < genres.Items.length; i++) {
        var genre = genres.Items[i];
        if(genre.Name === 'Anime'){
          con.info('Anime detected');
          page.url = window.location.origin+'/#!/itemdetails.html?id='+itemId;
          page.handlePage(page.url);
          $('html').removeClass('miniMAL-hide');
          break;
        }
      }
    });
  }
}

async function urlChange(page){
  $('html').addClass('miniMAL-hide');
  if(window.location.href.indexOf('id=') !== -1){
    var id = utils.urlParam(window.location.href, 'id');
    var reqUrl = '/Items?ids='+id;
    apiCall(reqUrl).then((response) => {
      var data = JSON.parse(response.responseText);
      switch(data.Items[0].Type) {
        case 'Season':
          con.log('Season', data);
          item = data.Items[0];
          reqUrl = '/Genres?Ids='+item.SeriesId;
          apiCall(reqUrl).then((response) => {
            var genres:any = JSON.parse(response.responseText);
            con.log('genres', genres);
            for (var i = 0; i < genres.Items.length; i++) {
              var genre = genres.Items[i];
              if(genre.Name === 'Anime'){
                con.info('Anime detected');
                page.handlePage();
                $('html').removeClass('miniMAL-hide');
                break;
              }
            }
          });
          break;
        case 'Series':
          con.log('Series', data);
          break;
        default:
          con.log('Not recognized', data);
      }

    });
  }
}

async function returnPlayingItemId(){
  return new Promise((resolve, reject) => {
    setTimeout(() => {resolve()}, 10000);
  }).then(() => {
    return apiCall('/Sessions').then((response) => {
        con.error(response);
        var data = JSON.parse(response.responseText);
        con.log(data);
        for (var i = 0; i < data.length; i++) {
          var sess = data[i];
          if(typeof sess.NowPlayingItem !== 'undefined'){
            con.log(sess.NowPlayingItem);
            return sess.NowPlayingItem.Id;
          }
        }
      });
  });
}

async function waitForBase(){
  return new Promise((resolve, reject) => {
    utils.waitUntilTrue(function(){
      return j.$('*[data-url]').length;
    }, function(){
      var base = j.$('*[data-url]').first().attr('data-url').split('/').splice(0,4).join('/');
      con.log('Base Found', base);
      resolve(base);
    });
  });
}

async function testApi(){
  return new Promise(async (resolve, reject) => {
    var base = await getBase();
    if(typeof base === 'undefined' || base === ''){
      con.info('No base');
      base = await waitForBase();
    }

    setBase(base);

    apiCall('/System/Info', null, base).then((response) => {
      if(response.status !== 200){
        con.error('Not Authenticated');
        setBase('');
        reject();
        return false;
      }
      resolve();
      return true;
    });
  });
}

async function askForApiKey(){
  return new Promise((resolve, reject) => {
    var msg = utils.flashm(
     `<p>${api.storage.lang('Emby_Authenticate')}</p>
      <p><input id="MS-ApiKey" type="text" placeholder="Please enter the Api Key here" style="width: 100%;"></p>
      <div style="display: flex; justify-content: space-around;">
        <button class="Yes" style="background-color: transparent; border: none; color: rgb(255,64,129);margin-top: 10px; cursor:pointer;">OK</button>
        <button class="Cancel" style="background-color: transparent; border: none; color: rgb(255,64,129);margin-top: 10px; cursor:pointer;">CANCEL</button>
      </div>
      `,
      {position: 'bottom', permanent: true, type: 'getApi'}
    );
    msg.find( '.Yes' ).click(function(evt){
      var api = j.$('#MS-ApiKey').val();
      con.info('api', api);
      setApiKey(api);
      j.$(evt.target).parentsUntil('.flash').remove();
      testApi()
        .then(()=>{
          resolve(true);
        }).catch(async ()=>{
          utils.flashm('Could not Authenticate');
          await askForApiKey();
          resolve(true);
        })
    });
    msg.find( '.Cancel' ).click(function(evt){
      j.$(evt.target).parentsUntil('.flash').remove();
      reject(false);
    });

  });
}

//Helper
async function apiCall(url, apiKey = null, base = null){
  if(apiKey === null) apiKey = await getApiKey();
  if(base === null) base = await getBase();
  if(url.indexOf('?') !== -1){
    var pre = '&';
  }else{
    var pre = '?';
  }
  url = base+url+pre+'api_key='+apiKey;
  con.log('Api Call', url);
  return api.request.xhr('GET', url);
}

export const Emby: pageInterface = {
    name: 'Emby',
    domain: 'http://app.emby.media',
    type: 'anime',
    isSyncPage: function(url){
      if(item.Type === 'Episode'){
        return true;
      }
      return false;
    },
    sync:{
      getTitle: function(url){return item.SeriesName + ((item.ParentIndexNumber > 1) ? ' Season '+item.ParentIndexNumber : '');},
      getIdentifier: function(url){
        if(typeof item.SeasonId !== 'undefined') return item.SeasonId;
        if(typeof item.SeriesId !== 'undefined') return item.SeriesId;
        return item.Id;
      },
      getOverviewUrl: function(url){return Emby.domain + '/#!/itemdetails.html?id=' + Emby.sync.getIdentifier(url);},
      getEpisode: function(url){return item.IndexNumber},
    },
    overview:{
      getTitle: function(url){return item.SeriesName + ((item.IndexNumber > 1) ? ' Season '+item.IndexNumber : '');},
      getIdentifier: function(url){return item.Id;},
      uiSelector: function(selector){selector.appendTo(j.$(".page:not(.hide) .detailSection").first());},
    },
    init(page){
      api.storage.addStyle(require('./style.less').toString());
      testApi()
        .catch(() => {
          con.info('Not Authenticated');
          return askForApiKey();
        })
        .then(() => {
          con.info('Authenticated');
          utils.changeDetect(() => {
            page.UILoaded = false;
            $('#flashinfo-div, #flash-div-bottom, #flash-div-top').remove();
            checkApi(page);
          }, () => {
            var src = $('video').first().attr('src');
            if(typeof src === 'undefined') return 'NaN';
            return src;
          });
          utils.urlChangeDetect(function(){
            if(!(window.location.href.indexOf('video') !== -1) && !(window.location.href.indexOf('#dlg') !== -1)){
              $('#flashinfo-div, #flash-div-bottom, #flash-div-top, #malp').remove();
              page.UILoaded = false;
              urlChange(page);
            }
          });
          j.$(document).ready(function(){
            utils.waitUntilTrue(function(){
              return j.$('.page').length;
            }, function(){
              urlChange(page);
            });
          });
          document.addEventListener("fullscreenchange", function() {
            //@ts-ignore
            if((window.fullScreen) || (window.innerWidth == screen.width && window.innerHeight == screen.height)) {
              $('html').addClass('miniMAL-Fullscreen');
            } else {
              $('html').removeClass('miniMAL-Fullscreen');
            }
          });
        });
    }
};
