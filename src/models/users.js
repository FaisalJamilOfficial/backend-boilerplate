const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const passportLocalMongoose = require("passport-local-mongoose");

const { USER_STATES, USER_STATUSES, USER_TYPES } = require("../configs/enums");
const { ONLINE, OFFLINE } = USER_STATES;
const { ACTIVE, DELETED } = USER_STATUSES;
const { USER, ADMIN } = USER_TYPES;

const fcm = {
	device: { type: String, required: true },
	fcm: { type: String, required: true },
};

const users = new Schema(
	{
		email: {
			type: String,
			trim: true,
			required: true,
			unique: true,
			validate: {
				validator: function (v) {
					return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
				},
				message: (props) => `${props.value} is not a valid email address!`,
			},
			index: true,
		},
		phone: {
			type: String,
			trim: true,
			index: true,
		},
		fcms: [fcm],
		type: {
			type: String,
			enum: [USER, ADMIN],
			required: true,
			index: true,
		},
		status: {
			type: String,
			enum: [ACTIVE, DELETED],
			default: "active",
			required: true,
			index: true,
		},
		state: {
			type: String,
			enum: [ONLINE, OFFLINE],
			default: ONLINE,
			required: true,
			index: true,
		},
		profile: {
			type: Schema.Types.ObjectId,
			ref: "profiles",
			index: true,
		},
		isPasswordSet: {
			type: Boolean,
			default: false,
			required: true,
		},
	},
	{
		timestamps: true,
	}
);
users.plugin(passportLocalMongoose, {
	usernameField: "email",
	lastLoginField: "lastLogin",
	attemptsField: "loginAttempts",
	maxAttempts: 10,
	maxInterval: 30000,
	limitAttempts: true,
	// usernameLowerCase: true,
});
module.exports = mongoose.model("users", users);
