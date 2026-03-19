const setUpChatHandler = (IO, socket, connectedUsers = []) => {
  socket.on("send-message", (messageData) => {
    const { content, reciever, conversationId, createdAt } = messageData;

    if (!content || !reciever?.id) {
      console.log("Invalid message recieved.", messageData);
      return;
    }

    console.log("connectedUsers", connectedUsers);

    const recipientUser = connectedUsers.find(
      (user) => user.ID === reciever.id
    );

    console.log(`📨 Message from ${socket.id} to ${reciever.id}: ${content}`);

    if (recipientUser) {
      IO.to(recipientUser.socketId).emit("recieve-message", {
        conversationId,
        content,
        reciever: { id: reciever.id },
        createdAt,
      });
    } else {
      console.log(`Recipient ${reciever.id} not connected`);
    }
  });
};

module.exports = setUpChatHandler;
