// START COMMAND
//
// FB_USERNAME='{NAME}' FB_PASSWORD='{PASSWORD}' node index.js
//
(async () => {
	// Check that we have credentails supplied otherwise die
	const FB_USERNAME = process.env.FB_USERNAME || (()=>{console.log('Missing ENV FB_USERNAME'); process.exit(1);})();
	const FB_PASSWORD = process.env.FB_PASSWORD || (()=>{console.log('Missing ENV FB_PASSWORD'); process.exit(1);})();

  const TINDER_APP_ID = '464891386855067';
	const TINDER_AUTH_URL = `https://www.facebook.com/v2.6/dialog/oauth?redirect_uri=fb464891386855067%3A%2F%2Fauthorize%2F&display=touch&state=%7B%22challenge%22%3A%22IUUkEUqIGud332lfu%252BMJhxL4Wlc%253D%22%2C%220_auth_logger_id%22%3A%2230F06532-A1B9-4B10-BB28-B29956C71AB1%22%2C%22com.facebook.sdk_client_state%22%3Atrue%2C%223_method%22%3A%22sfvc_auth%22%7D&scope=user_birthday%2Cuser_photos%2Cuser_education_history%2Cemail%2Cuser_relationship_details%2Cuser_friends%2Cuser_work_history%2Cuser_likes&response_type=token%2Csigned_request&default_audience=friends&return_scopes=true&auth_type=rerequest&client_id=464891386855067&ret=login&sdk=ios&logger_id=30F06532-A1B9-4B10-BB28-B29956C71AB1&ext=1470840777&hash=AeZqkIcf-NEW6vBd`;

  const env = process.env.ENV;

  const puppeteer = require('puppeteer');
  var prompt = require('prompt-promise');

  // Create the browser and head to the AUTH URL
  const puppetOpts = {};

  if(env && env.toLowerCase() === 'debug') 
    puppetOpts.headless = false;

  const browser = await puppeteer.launch(puppetOpts);
  global.page = await browser.newPage();
  await page.goto(TINDER_AUTH_URL);

  // Log into facebook if needed;
  const is_login_page = (await page.title()).toLowerCase().includes('log in');
  if(is_login_page) {
    console.log('Authenticating with facebook');

    await page.evaluate((FB_USER, FB_PASS) => {
     	document.querySelector('#email').value = FB_USER;
	    document.querySelector('#pass').value = FB_PASS;
    }, FB_USERNAME, FB_PASSWORD); 
    
    await Promise.all([
      await page.click('#loginbutton'),
      await page.waitForNavigation(),
    ]); 

    const is_still_login_page = (await page.title()).toLowerCase().includes('log in');
    if(is_still_login_page) {
      console.log('Issue loggin in; Please check your credentials');
      process.exit();
    }

    // Check for 2 Factor
    const is_2fa_page = await page.evaluate(() => document.querySelector('input[name="approvals_code"]')) !== null;
    if(is_2fa_page) {

      console.log('Waiting for 2FA (5 mins)');

      await Promise.race([
        page.waitForNavigation({timeout: 300000}),
        prompt('Enter 2FA Code: ')
      ]).then(async function(response){
        console.log('2FA Response Obtained');

        const is_auth_page = await page.evaluate((TINDER_APP_ID) => { 
          document.querySelector('input[name="app_id"]') !== null && document.querySelector('input[name="app_id"]').value === TINDER_APP_ID
        }, TINDER_APP_ID);

        if(is_auth_page || typeof response === 'object') {
          console.log('2FA Response From App');
        }else {
          console.log(`2FA Code From CLI: ${response}`);

          await page.evaluate((code) => {
            document.querySelector('input[name="approvals_code"]').value = code;
          }, response); 

          // Submit Code
          await Promise.all([
            await page.click('button[name="submit[Continue]"]'),
            await page.waitForNavigation({ waitUntil: 'networkidle2' }),
          ]);

          // Save Browser Diag
          await Promise.all([
            await page.click('button[name="submit[Continue]"]'),
            await page.waitForNavigation({ waitUntil: 'networkidle2' }),
          ]);
        }
      });
    }
    console.log('Authentication Complete!')
  } else {
    console.log('Already authenticated with facebook.');
  }



  // Authenticate with tinder
  const is_auth_page = await page.evaluate(() => document.querySelector('input[name="app_id"]').value) === TINDER_APP_ID;
  if(is_auth_page) {
    console.log('Perform Auth Actions');

    // Ajax Handler to catch the access token
    page.on('response', response => {
      if(!response.url().includes('dialog/oauth/confirm?dpr=1')) {
        return;
      }

      response.text().then(function (textBody) {
        if(!textBody.includes('&access_token=')) {
          return;
        }

        const access_token = (new RegExp('.+&access_token=(.+?)&')).exec(textBody)[1];
        console.log('Access Token: ' + access_token);
        browser.close();
      }).catch(()=>{});
    });

    // Confirm stuff
    await page.waitForSelector('button[name="__CONFIRM__"]');
    await page.click('button[name="__CONFIRM__"]');
    await page.click('button[name="__CONFIRM__"]');
  }else{
    console.log('Issue reaching auth page; Are your login details correct?');
    process.exit();
  }

})();
