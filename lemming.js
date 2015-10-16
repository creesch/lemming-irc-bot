// let's require some stuff, since we need it.
// TODO: make a proper package.json so install can be used.
require('./config.js');

var async = require("async"),
    sqlite3 = require('sqlite3').verbose(),
    irc = require('irc'),
    snooCore = require('snoocore');

//
// Start with reddit stuff here
//

var reddit = new snooCore(lemmingPrefs.redditConfig);

//
// Start with irc general stuff here
//

var bot = new irc.Client(lemmingPrefs.ircConfig.server, lemmingPrefs.ircConfig.botName, {
    channels: lemmingPrefs.ircConfig.channels,
    sasl: true,
    autoRejoin: true,
    userName: lemmingPrefs.ircConfig.botName,
    password: lemmingPrefs.ircConfig.botAuthPassword
});


//
// This is where the bot starts.
//

bot.addListener('error', function(message) {
    console.log('error: ', message);

    if (message.command === 'err_inviteonlychan') {
        setTimeout(function() {
            bot.join(message.args[1]);
        }, 3000);
    }

});

// Listen for any message on irc and act on it.
// TODO: Make command detection smarter and allow prefix setting.
// TODO: Add configuration commands

bot.addListener('message', function(from, to, text, message) {
    // console.log(from);
    // console.log(to);
    // console.log(text);
    // console.log(message);
    var receivedMessage = message.args[1];


    // let lemming say stuff publicly
    if (receivedMessage.substring(0, 5) === '|say ') {

        var sendingMessage = receivedMessage.substring(5);
        sendingMessage = sendingMessage.trim();

        while (sendingMessage.trim().substring(0, 1) === '!') {
            sendingMessage = sendingMessage.trim().substr(1);
        }

        bot.say(message.args[0], sendingMessage);
    }

    // let lemming say stuff through a private message

    if (from === lemmingPrefs.botOwner && to === lemmingPrefs.ircConfig.botName && receivedMessage.substring(0, 9) === '|channel ') {
        var command = receivedMessage.substring(9);

        var commandChann = command.substr(0, command.indexOf(' '));
        var commandMessage = command.substr(command.indexOf(' ') + 1);

        bot.say(commandChann, commandMessage);

    }


    // trigger lemming on a specific set of words
    var triggerWord = false;

    lemmingPrefs.factTriggers.forEach(function(value, index) {
        //console.log(value);
        //console.log(index);
        var regexValue = new RegExp(value, 'i');
        if (receivedMessage.match(regexValue)) {
            triggerWord = true;
        }
    });

    if (triggerWord) {
        bot.say(message.args[0], lemmingPrefs.randomCreeschFacts[Math.floor(Math.random() * lemmingPrefs.randomCreeschFacts.length)]);
    }

    if (receivedMessage.substring(0, 11) === '|testasync ' && from === lemmingPrefs.botOwner) {
        // console.log('testing async shizzle');
        testingAsync();
    }

    if (receivedMessage.substring(0, 16) === '|lastsubmission ' && from === lemmingPrefs.botOwner) {
        // console.log('/r/' + receivedMessage.substring(16) + '/new?limit=1');


        reddit('/r/' + receivedMessage.substring(16) + '/new?limit=1').get().then(function(result) {
           // console.log(result.data.children[0]);

            var submissionTitle = result.data.children[0].data.title,
                submissionUrl = 'https://redd.it/' + result.data.children[0].data.id,
                submissionAuthor = result.data.children[0].data.author,
                submissionSub = '/r/' + result.data.children[0].data.subreddit,
                submissionDomain = result.data.children[0].data.domain;

            var submissionMessage = submissionSub + ': <' + submissionAuthor + '> ' + submissionTitle + ' ( ' + submissionUrl + ' ) [ ' + submissionDomain + ' ]';

            bot.say(message.args[0], submissionMessage);
        });

    }

});

//
// Testing and debugging some stuff
//

var testingAsync = function() {
    reddit('/r/creesch/new').get().then(function(result) {

        var submissionsNew = result.data.children.reverse();

        submissionsNew.forEach(function(value, index) {
            var submissionTitle = value.data.title;
           // console.log(submissionTitle);
        });

    });
}

// Get the latest submissions in subreddits and push them to channels.

//
// First time using sqlite *fingers crossed*
// Getting all the announcer based stuff.
//

var announceChannels = {},
    latestSubmission = {},
    announceSubreddits = [],
    db = new sqlite3.Database('lemmingConfig');

db.serialize(function() {

    // create table if it isn't there
    db.run('CREATE TABLE IF NOT EXISTS lastsubmissions (subreddit TEXT, submissionID INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS channelSubMapping (channel TEXT, subreddit TEXT)');
    db.each('SELECT channel, subreddit FROM channelSubMapping', function(err, row) {
       // console.log(row.channel + ': ' + row.subreddit);
        var channel = row.channel,
            subreddit = row.subreddit;

        if (!announceChannels.hasOwnProperty(channel)) {
            announceChannels[channel] = [subreddit];
          //  console.log('creating object property:', channel);
        } else {
            announceChannels[channel].push(subreddit);
          //  console.log('pushing:', subreddit)
        }

        if (announceSubreddits.indexOf(subreddit) === -1) {
            announceSubreddits.push(subreddit);
        }

    });

    db.each('SELECT subreddit, submissionID FROM lastsubmissions', function(err, row) {
        if (!latestSubmission.hasOwnProperty(row.subreddit)) {
            latestSubmission[row.subreddit] = row.submissionID;
        }
    });

    // console.log(latestSubmission);
});


// Let's put it in async so it doesn't take a long ass time.

function look() {
    _look(function(err) {
        if (err) {
            throw err;
        }

        setTimeout(look, 60000);
    });
}

bot.on('motd', look);

function _look(done) {
    // Let's get each subs new stuff in async formation.
    async.each(announceSubreddits,
        function(item, callback) {
            // Make the actual call here
            reddit('/r/' + item + '/new?limit=1').get().then(function(result) {

                var submissionsNew = result.data.children.reverse();

                submissionsNew.forEach(function(value, index) {
                    // This shizzle we need.
                    var submissionTitle = '\x02' + value.data.title + '\x0F',
                        submissionUrl = 'https://redd.it/' + value.data.id,
                        submissionID = value.data.id,
                        submissionAuthor = value.data.author,
                        submissionSub = '/r/' + value.data.subreddit,
                        submissionDomain = value.data.domain;

                    // this converts reddit base36 ids to base10 so we van easily check.
                    var intID = parseInt(submissionID, 36);

                    if (intID > latestSubmission[item]) {
                        latestSubmission[item] = intID;
                        var submissionMessage = submissionSub + ': <' + submissionAuthor + '> ' + submissionTitle + ' ( ' + submissionUrl + ' ) [ ' + submissionDomain + ' ]';

                        for (var key in announceChannels) {
                            if (announceChannels.hasOwnProperty(key)) {
                                var subredditsToAnnounce = announceChannels[key];

                                if (subredditsToAnnounce.indexOf(item) > -1) {
                                    bot.say('#' + key, submissionMessage);
                                }
                            }
                        }
                    }
                });
                callback();
            });
        },
        // 3rd param is the function to call when everything's done
        function(err) {
            // All tasks are done now
            if (err) {
                throw err;
            }
            // Ok time to update our latest vars.
            var updateLatestDB = db.prepare('UPDATE lastsubmissions SET submissionID=(?) WHERE subreddit=(?)');
            for (var key in latestSubmission) {
                if (latestSubmission.hasOwnProperty(key)) {
                   // console.log(latestSubmission[key]);
                    updateLatestDB.run(latestSubmission[key], key);
                }
            }
            updateLatestDB.finalize();


            done(null);
        });

}
