'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const app = express();
const cors = require('cors');

// const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

const Questions = require('./models/questions.js');

// mongoose.connect('mongodb://localhost:27017/qlaunch');
mongoose.connect(process.env.MONGODB_URI);

function reorderMessages(messages) {
  messages.sort((a, b) => {
    return b.votes.length - a.votes.length;
  });
  return messages;
}

io.on('connection', function(socket){

  socket.join('default');
  socket.leave(socket.id);
  socket.emit('rooms', Object.keys(io.sockets.adapter.rooms));
  console.log('trying to find rooms', Object.keys(io.sockets.adapter.rooms));
  
  socket.on('send-question', question => {

    Questions.create(question)
      .then(() => {
        return Questions.find({room: question.room});
      })
      .then(questions => {
        return reorderMessages(questions);
      })
      .then(questions => {
        io.to(question.room).emit('send-all-questions', questions);
      });
      
  });

  socket.on('vote', voteInfo => {
    console.log('V1. 1 server vote', voteInfo);
    Questions.find({_id: voteInfo.id})
      .then(entry => {
        console.log('V2. entry', entry);
        let votes = entry[0].votes.slice();
        console.log('V2b. votes', votes);
        if (votes.indexOf(voteInfo.clientId) > -1) {
          console.log('V3a. already voted on this');

          for (let i = 0; i < votes.length; i++) {
            let currentVoteId = votes[i];
            if (currentVoteId === voteInfo.clientId) {
              console.log('V3a2. Found the person who voted', currentVoteId);
              votes.splice(i, 1);
            }
          }

          return Questions.findOneAndUpdate({_id: voteInfo.id}, {votes: votes});
        } else if (votes.indexOf(voteInfo.clientId) === -1) {
          console.log('V3b. not voted on this yet');
          votes.push(voteInfo.clientId);
          return Questions.findOneAndUpdate({_id: voteInfo.id}, {votes: votes});
        }
      }).then(() => {
        return Questions.find({room: voteInfo.room});
      }).then(questions => {
        console.log('V4. updated questions', questions);
        let reorderedQuestions = reorderMessages(questions);
        io.to(voteInfo.room).emit('send-all-questions', reorderedQuestions);
      });
  });

  socket.on('create-room', room => {

    socket.join(room);

    Questions.find({room: room})
      .then(questions => {
        return reorderMessages(questions);
      })
      .then(questions => {
        socket.emit('send-all-questions', questions);
      });
    io.emit('rooms', Object.keys(io.sockets.adapter.rooms));
  });

  socket.on('join', data => {
    socket.join(data.enter);
    socket.leave(data.exit);
    io.emit('rooms', Object.keys(io.sockets.adapter.rooms));
    Questions.find({room: data.enter})
      .then(questions => {
        questions.sort((a, b) => {
          return b.votes - a.votes;
        });
        return questions;
      })
      .then(questions => {
        socket.emit('send-all-questions', questions);
      });
  });

});

app.use(cors());

app.use(express.static(path.join(__dirname, './public')));

app.get('/', (req, res, next) => {
  res.sendFile(__dirname + './index.html');
});

http.listen(process.env.PORT || 3000, function(){
  console.log('listening on port process.env.PORT', process.env.PORT);
});