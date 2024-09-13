export const mockSsmClient = {
	send: () => {
	  return {
		result: "Success",
		Parameter: {
			Value: "EXPERIAN"
		},
	  };
	},
  };
  
