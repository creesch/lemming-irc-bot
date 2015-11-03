// let's require some stuff, since we need it.
// TODO: make a proper package.json so install can be used.
require('./config.js');

var async = require("async"),
    sqlite3 = require('sqlite3').verbose(),
    irc = require('irc'),
    snooCore = require('snoocore'),
    GitHubApi = require("github"),
    request = require('request');




var github = new GitHubApi({
    // required
    version: "3.0.0",
    // optional
    debug: true,
    timeout: 5000,
    headers: {
        "user-agent": "Creesch his github irc bot" // GitHub is happy with a unique user agent
    }
});

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
//
//

var announceChannels = {},
    latestSubmission = {},
    announceSubreddits = [],
    db = new sqlite3.Database('lemmingConfig');


//
// General functions
//

var ircColorHash = function(string) {
    var colorArray = ['dark_blue', 'dark_green', 'light_red', 'dark_red', 'magenta', 'orange', 'yellow', 'cyan', 'light_cyan', 'light_blue', 'light_magenta'];
    return colorArray[string.substr(-1).charCodeAt(0) % colorArray.length];
};

//
// This is where the bot starts.
//

bot.addListener('error', function(message) {

    if (message.command === 'err_inviteonlychan') {
        setTimeout(function() {
            bot.join(message.args[1]);
        }, 3000);
    } else {
        console.log(message);
    }

});

// Listen for any message on irc and act on it.

// TODO: Add configuration commands

bot.addListener('raw', function(message) {
    // console.log(message);
});



bot.addListener('message', function(from, to, text, message) {
    // console.log(from);
    // console.log(to);
    // console.log(text);
    // console.log(message);
    var receivedMessage = message.args[1],
        contextChannel = message.args[0];


    // let lemming say stuff publicly
    //
    //
    //


    if (/#\d{1,4}/.test(receivedMessage)) {

        var githubNumber = receivedMessage.match(/#(\d{1,4})/);
        githubNumber = githubNumber[1];


        github.issues.getRepoIssue({
            // optional:
            // headers: {
            //     "cookie": "blahblah"
            // },
            user: "creesch",
            repo: "reddit-moderator-toolbox",
            number: githubNumber
        }, function(err, res) {
            if (err) {
                bot.say(contextChannel, err.message);
            } else {


                request.post(
                    'http://git.io', {
                        form: {
                            url: 'https://github.com/creesch/reddit-moderator-toolbox/issues/' + githubNumber
                        }
                    },
                    function(error, response, body) {
                        if (!error && response.statusCode == 200) {
                            console.log(response);

                        } else if (!error) {
                            var responseHeaders = response.headers;

                            bot.say(contextChannel, res.title + ' ' + responseHeaders.location);
                        }
                    }
                );


            }
        });
    }

    if (/^(\|).*$/.test(receivedMessage)) {
        console.log('this is a command');

        var receivedCommand = receivedMessage.match(/^\|(.+?)\b/);
        receivedCommand = receivedCommand[1];

        var commandParameters;
        if (/^\|.+?\s(.*)/.test(receivedMessage)) {
            commandParameters = receivedMessage.match(/^\|.+?\s(.*)/);
            commandParameters = commandParameters[1].trim();
        }

        console.log(receivedCommand);
        console.log(commandParameters);

        switch (receivedCommand) {
            //
            // Disconnect command, 
            //
            case 'disconnect':
                if (from === lemmingPrefs.botOwner) {
                    bot.disconnect('Seeya!');
                }
                break;
                //
                // Ping command, pings everyone in the channel
                //
            case 'ping':
                if (from === lemmingPrefs.botOwner) {
                    var currentChannelList = bot.chans[contextChannel];
                    var currentUserlist = currentChannelList.users;
                    var pingedUsers = '';

                    for (var key in currentUserlist) {
                        if (currentUserlist.hasOwnProperty(key)) {

                            pingedUsers = pingedUsers + ' ' + key;
                        }
                    }


                    bot.say(contextChannel, pingedUsers);

                }
                break;
                //
                // Ping OP command, pings every OP in the channel
                //
            case 'pingOp':
                if (from === lemmingPrefs.botOwner) {
                    var currentChannelList = bot.chans[contextChannel];
                    var currentUserlist = currentChannelList.users;
                    var pingedUsers = '';

                    for (var key in currentUserlist) {
                        if (currentUserlist.hasOwnProperty(key) && currentUserlist[key] === '@') {
                            pingedUsers = pingedUsers + ' ' + key;
                        }
                    }


                    bot.say(contextChannel, pingedUsers);

                }
                break;
                //
                // Say command, lets lemming say stuff in the same channel.
                //
            case 'say':

                while (commandParameters.trim().substring(0, 1) === '!') {
                    commandParameters = commandParameters.trim().substr(1);
                }

                bot.say(contextChannel, commandParameters);
                break;
                //
                // channel command, directs lemming to say something into a specific channel.
                //
            case 'channel':
                if (from === lemmingPrefs.botOwner && to === lemmingPrefs.ircConfig.botName) {
                    var commandChann = commandParameters.substr(0, command.indexOf(' '));
                    var commandMessage = commandParameters.substr(command.indexOf(' ') + 1);

                    bot.say(commandChann, commandMessage);

                } else {
                    bot.say(from, 'Sorry, ' + from + ' I cannot do that.');
                }

                break;
                //
                // add command, put a subreddit on a channel watchlist.
                //			
            case 'add':
                if (from === lemmingPrefs.botOwner) {

                    // Already defined, but for clarity lets use the 'subreddit' as variable name.
                    var subreddit = commandParameters,
                        channel = contextChannel;


                    // First check if the sub isn't already on this channel's watchlist.		
                    if (announceChannels.hasOwnProperty(contextChannel) && announceChannels[contextChannel].indexOf(subreddit) > -1) {
                        bot.say(contextChannel, 'You are silly! ' + subreddit + ' is already on the watchlist!');
                    } else {

                        // If the subrddit isn't watched yet we'll have to fetch data.
                        if (announceSubreddits.indexOf(subreddit) === -1) {
                            // Fecth all raw info since the subreddit isn't in the list.
                            reddit('/r/' + subreddit + '/new?limit=1').get().then(function(result) {
                                // console.log(result.data.children[0]);
                                if (result.data.children.length === 0) {
                                    console.log('error in reddit results:');
                                    console.log(result);
                                } else {
                                    var latestID = result.data.children[0].data.id;

                                    var latestIntID = parseInt(latestID, 36);

                                    if (!announceChannels.hasOwnProperty(contextChannel)) {
                                        announceChannels[contextChannel] = [subreddit];
                                        // console.log('creating object property:', contextChannel);
                                    } else {
                                        announceChannels[contextChannel].push(subreddit);
                                        //console.log('pushing:', subreddit);
                                    }

                                    db.run('INSERT INTO channelSubMapping (channel, subreddit) VALUES ("' + contextChannel + '","' + subreddit + '")');

                                    if (announceSubreddits.indexOf(subreddit) === -1) {
                                        announceSubreddits.push(subreddit);
                                    }

                                    if (!latestSubmission.hasOwnProperty(subreddit)) {
                                        latestSubmission[subreddit] = latestIntID;

                                        db.run('INSERT INTO lastsubmissions (subreddit, submissionID) VALUES ("' + subreddit + '","' + latestIntID + '")');
                                    }


                                    bot.say(contextChannel, 'Added ' + subreddit + ' to watchlist!');

                                }
                            }).catch(function(error) {
                                console.log('reddit error:');

                                console.log(error);
                                bot.say(contextChannel, 'I can\'t seem to access that subreddit, it is either private or you misspelled it.');
                            });
                            // If the channel is being watched we'll simply put it on this particular channel's list.
                        } else {


                            if (!announceChannels.hasOwnProperty(contextChannel)) {
                                announceChannels[contextChannel] = [subreddit];
                                //console.log('creating object property:', channel);
                            } else {
                                announceChannels[contextChannel].push(subreddit);
                                //console.log('pushing:', subreddit);
                            }


                            db.run('INSERT INTO channelSubMapping (channel, subreddit) VALUES ("' + contextChannel + '","' + subreddit + '")');
                            bot.say(contextChannel, 'Added ' + subreddit + ' to watchlist!');
                        }

                    }

                } else {
                    bot.say(contextChannel, 'Sorry, ' + from + ' I cannot do that.');
                }
                break;
                //
                // list command, lists all subreddits being watched for this channel
                //
            case 'list':
                if (!announceChannels.hasOwnProperty(contextChannel)) {
                    bot.say(contextChannel, 'No subreddits being watched in this channel.');
                } else {
                    bot.say(contextChannel, 'Subreddits being watched: ' + announceChannels[contextChannel].toString());
                }
                break;
                //
                // del command, makes lemming remove a channel from the watchlist.
                //
                //
                // TODO: make this do something
                //
            case 'del':
                bot.say(contextChannel, 'I have not learned to forget yet.');
                break;
                //
                //
                //
            case 'lastsubmission':
                if (from === lemmingPrefs.botOwner) {
                    // console.log('/r/' + receivedMessage.substring(16) + '/new?limit=1');



                    reddit('/r/' + commandParameters + '/new?limit=1').get().then(function(result) {
                        // console.log(result.data.children[0]);
                        if (result.data.children.length === 0) {
                            console.log('ERROR:');
                            console.log(result);
                        } else {
                            var submissionTitle = result.data.children[0].data.title,
                                submissionUrl = 'https://redd.it/' + result.data.children[0].data.id,
                                submissionAuthor = result.data.children[0].data.author,
                                submissionSub = result.data.children[0].data.subreddit,
                                submissionDomain = result.data.children[0].data.domain;

                            submissionSub = irc.colors.wrap(ircColorHash(submissionSub), '/r/' + submissionSub);

                            var submissionMessage = submissionSub + ': <' + submissionAuthor + '> ' + submissionTitle + ' ( ' + submissionUrl + ' ) [ ' + submissionDomain + ' ]';

                            bot.say(message.args[0], submissionMessage);
                        }
                    }).catch(function(error) {
                        console.log(error);
                        bot.say(message.args[0], 'I can\'t seem to access that subreddit, it is either private or you misspelled it.');
                    });

                }
                break;
            default:
                bot.say(contextChannel, 'I am not familiar with the command "' + receivedCommand + '"');
        }

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


});


// Get the latest submissions in subreddits and push them to channels.

//
// First time using sqlite *fingers crossed*
// Getting all the announcer based stuff.
//



db.serialize(function() {

    // create table if it isn't there
    db.run('CREATE TABLE IF NOT EXISTS lastsubmissions (subreddit TEXT, submissionID INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS channelSubMapping (channel TEXT, subreddit TEXT)');
    db.each('SELECT channel, subreddit FROM channelSubMapping', function(err, row) {
        if (err) {
            console.log('database error:');
            console.log(err);
        }
        // console.log(row.channel + ': ' + row.subreddit);
        var channel = row.channel,
            subreddit = row.subreddit;

        if (!announceChannels.hasOwnProperty(channel)) {
            announceChannels[channel] = [subreddit];
            //  console.log('creating object property:', channel);
        } else {
            announceChannels[channel].push(subreddit);
            //  console.log('pushing:', subreddit);
        }

        if (announceSubreddits.indexOf(subreddit) === -1) {
            announceSubreddits.push(subreddit);
        }

    });

    db.each('SELECT subreddit, submissionID FROM lastsubmissions', function(err, row) {
        if (err) {
            console.log('database error:');
            console.log(err);
        }
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

                if (result.data.children.length === 0) {
                    console.log('ERROR:');
                    console.log(result);
                } else {
                    var submissionsNew = result.data.children.reverse();

                    submissionsNew.forEach(function(value, index) {
                        // This shizzle we need.
                        var submissionTitle = '\x02' + value.data.title + '\x0F',
                            submissionUrl = 'https://redd.it/' + value.data.id,
                            submissionID = value.data.id,
                            submissionAuthor = value.data.author,
                            submissionSub = '/r/' + value.data.subreddit,
                            submissionDomain = value.data.domain;

                        // This converts the sub name to a nice color
                        submissionSub = irc.colors.wrap(ircColorHash(item), submissionSub);

                        // this converts reddit base36 ids to base10 so we van easily check.
                        var intID = parseInt(submissionID, 36);

                        if (intID > latestSubmission[item]) {
                            latestSubmission[item] = intID;
                            var submissionMessage = submissionSub + ': <' + submissionAuthor + '> ' + submissionTitle + ' ( ' + submissionUrl + ' ) [ ' + submissionDomain + ' ]';

                            for (var key in announceChannels) {
                                if (announceChannels.hasOwnProperty(key)) {
                                    var subredditsToAnnounce = announceChannels[key];

                                    if (subredditsToAnnounce.indexOf(item) > -1) {
                                        bot.say(key, submissionMessage);
                                    }
                                }
                            }
                        }
                    });
                }


                callback();
            }).catch(function(error) {
                // log the error
                console.log('reddit error:');
                console.log(error);
                // continue anyway, most likely reddit borking so eventually it will work again.
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
